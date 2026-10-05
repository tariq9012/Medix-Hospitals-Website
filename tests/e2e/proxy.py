"""Tiny cuttable TCP proxy: lets a test genuinely drop (and later restore) a browser's connections to the app."""
import socket, threading

class Proxy:
    def __init__(self, listen_port, target_port):
        self.lp, self.tp = listen_port, target_port
        self.down = False; self.conns = []; self.lock = threading.Lock(); self.srv = None
        self._start_listener()

    def _start_listener(self):
        self.srv = socket.socket(); self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(("127.0.0.1", self.lp)); self.srv.listen(64)
        threading.Thread(target=self._accept, args=(self.srv,), daemon=True).start()

    def _accept(self, srv):
        while True:
            try: c, _ = srv.accept()
            except OSError: return
            if self.down: c.close(); continue
            try: t = socket.create_connection(("127.0.0.1", self.tp), timeout=10)
            except OSError: c.close(); continue
            with self.lock: self.conns += [c, t]
            for a, b in ((c, t), (t, c)):
                threading.Thread(target=self._pipe, args=(a, b), daemon=True).start()

    @staticmethod
    def _pipe(a, b):
        try:
            while True:
                d = a.recv(65536)
                if not d: break
                b.sendall(d)
        except OSError: pass
        for s in (a, b):
            try: s.close()
            except OSError: pass

    def kill_all(self):
        with self.lock: conns, self.conns = self.conns, []
        for s in conns:
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass
            try: s.close()
            except OSError: pass

    def set_down(self, down):
        self.down = down
        if down: self.kill_all()
