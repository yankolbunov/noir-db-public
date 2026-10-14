"""SSH-туннель к базе через системный ssh из macOS (без сторонних библиотек).
ssh -N -L 127.0.0.1:<свободный порт>:<сервер базы>:<порт базы> пользователь@ssh-сервер – и база видна как localhost.
Вход по ключу (~/.ssh, ssh-agent или указанный файл) или по паролю (через SSH_ASKPASS, пароль не пишется в файл).
ssh запускается через маленькую оболочку, которая убивает его, как только закрывается связь с приложением:
даже если приложение упадёт, туннель не останется висеть."""
import os
import re
import shlex
import socket
import subprocess
import tempfile
import threading
import time
from pathlib import Path

_ASKPASS = "#!/bin/sh\nprintf '%s\\n' \"$NOIR_SSH_PW\"\n"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _error_code(text):
    t = (text or "").lower()
    if "permission denied" in t or "authentication" in t or "too many authentication" in t:
        return "SSH_AUTH"
    if "host key verification failed" in t or "remote host identification has changed" in t:
        return "SSH_HOSTKEY"
    if "could not resolve" in t or "nodename nor servname" in t:
        return "SSH_HOST"
    if "connection refused" in t or "timed out" in t or "no route" in t or "network is unreachable" in t:
        return "SSH_CONN"
    if "forwarding failed" in t or "connect failed" in t or "administratively prohibited" in t:
        return "SSH_FORWARD"
    return "SSH_FAIL"


class Tunnel:
    def __init__(self, ssh, db_host, db_port, password=None):
        self.ssh = ssh                      # {host, port, user, auth: key|password, key}
        self.db_host = db_host or "localhost"
        self.db_port = int(db_port or 5432)
        self.password = password
        self.port = None
        self.proc = None
        self._methods = None
        self._lock = threading.Lock()

    def key(self):
        """Одинаковые настройки и пароль – тот же туннель."""
        s = self.ssh
        return (s.get("host"), int(s.get("port") or 22), s.get("user"), s.get("auth"), s.get("key"),
                self.db_host, self.db_port, self.password)

    def alive(self):
        return self.proc is not None and self.proc.poll() is None

    def ensure(self):
        """Поднять туннель (или проверить, что он жив) – вернуть локальный порт."""
        with self._lock:
            if self.alive() and _port_open(self.port):
                return self.port
            self._stop()
            self._start()
            return self.port

    def _start(self):
        try:
            self._launch(kbd=False)
        except RuntimeError as e:
            # вход по паролю: сначала способ «password» – при неверном пароле отказ за ~2 с;
            # «keyboard-interactive» (на macOS после неверного пароля висит долго) – только если сервер «password» не принимает
            if str(e) == "SSH_AUTH" and self.ssh.get("auth") == "password" and self._methods and "password" not in self._methods:
                self._launch(kbd=True)
            else:
                raise

    def _launch(self, kbd):
        s = self.ssh
        self._methods = None
        if not s.get("host") or not s.get("user"):
            raise RuntimeError("SSH_FIELDS")
        self.port = _free_port()
        cmd = ["ssh", "-N", "-T",
               "-L", f"127.0.0.1:{self.port}:{self.db_host}:{self.db_port}",
               "-p", str(int(s.get("port") or 22)),
               "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3",
               "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=6"]
        env = dict(os.environ)
        if s.get("auth") == "password":
            ask = Path(tempfile.gettempdir()) / f"noirdb-askpass-{os.getuid()}.sh"
            if not ask.exists() or ask.read_text() != _ASKPASS:
                ask.write_text(_ASKPASS)
            ask.chmod(0o700)
            env.update(SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE="force", DISPLAY=env.get("DISPLAY", ":0"),
                       NOIR_SSH_PW=self.password or "")
            cmd += ["-o", "PreferredAuthentications=" + ("keyboard-interactive" if kbd else "password"), "-o", "NumberOfPasswordPrompts=1",
                    "-o", "PubkeyAuthentication=no"]
        else:
            cmd += ["-o", "BatchMode=yes"]
            if s.get("key"):
                cmd += ["-i", os.path.expanduser(s["key"]), "-o", "IdentitiesOnly=yes"]
        cmd.append(f"{s['user']}@{s['host']}")
        # оболочка: ssh в фоне; сторож читает связь с приложением (<&0 – иначе фоновой команде дают пустой ввод);
        # когда приложение закроется – связь рвётся, и сторож убивает ssh
        wrapper = f"{' '.join(shlex.quote(x) for x in cmd)} </dev/null & p=$!; trap 'kill $p 2>/dev/null' EXIT; (cat >/dev/null; kill $p 2>/dev/null) <&0 2>/dev/null & wait $p"
        self.proc = subprocess.Popen(["/bin/sh", "-c", wrapper], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.PIPE, env=env, start_new_session=True)
        deadline = time.time() + 10
        while time.time() < deadline:
            if self.proc.poll() is not None:
                try:
                    self.proc.stdin.close()          # сторож туннеля тоже завершится
                except Exception:
                    pass
                err = self.proc.stderr.read().decode("utf-8", "replace") if self.proc.stderr else ""
                self.proc = None
                m = re.search(r"Permission denied \(([^)]*)\)", err)
                self._methods = m.group(1).split(",") if m else None
                code = _error_code(err)
                if code == "SSH_FAIL":
                    raise ValueError("SSH_FAIL:" + (err.strip().splitlines()[-1][:200] if err.strip() else "ssh"))
                raise RuntimeError(code)
            if _port_open(self.port):
                return
            time.sleep(0.05)
        # за 10 секунд туннель не открылся: останавливаем ssh и показываем, на чём он застрял
        p = self.proc
        self._stop()
        err = ""
        try:
            err = p.stderr.read().decode("utf-8", "replace").strip() if p and p.stderr else ""
        except Exception:
            pass
        code = _error_code(err)
        if code != "SSH_FAIL":
            raise RuntimeError(code)
        raise RuntimeError("SSH_TIMEOUT") if not err else ValueError("SSH_FAIL:" + err.splitlines()[-1][:200])

    def _stop(self):
        p, self.proc = self.proc, None
        if p is None:
            return
        try:
            p.stdin.close()               # оболочка убьёт ssh
        except Exception:
            pass
        try:
            p.wait(1)
        except Exception:
            try:
                os.killpg(p.pid, 15)
            except Exception:
                pass

    def close(self):
        with self._lock:
            self._stop()
