"""mDNS announcement service for TriviaMQTT."""

from __future__ import annotations

import socket
import threading

from zeroconf import IPVersion, ServiceInfo, Zeroconf

from app import config


class MDNSService:
    def __init__(self) -> None:
        self._zeroconf: Zeroconf | None = None
        self._services: list[ServiceInfo] = []
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._state = "stopped"

    def start(self) -> None:
        if self._thread is not None or not config.MDNS_ENABLED:
            return
        hostname = config.MDNS_HOSTNAME.strip().lower()
        if not hostname:
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="mdns-service", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        hostname = config.MDNS_HOSTNAME.strip().lower()
        while not self._stop_event.is_set():
            try:
                self._register_services(hostname)
                self._state = "active"
                print(f"[mdns] ACTIVE: http://{hostname}.local:{config.APP_PORT}/setup")
                print(f"[mdns] Fallback URL: http://192.168.1.4:{config.APP_PORT}/setup")

                while not self._stop_event.wait(2):
                    continue
            except Exception as exc:
                self._state = "retrying"
                print(f"[mdns] RETRYING after error: {exc}")
                self._clear_services()
                if self._stop_event.wait(5):
                    break

        self._clear_services()
        self._state = "stopped"

    def _register_services(self, hostname: str) -> None:
        self._zeroconf = Zeroconf(ip_version=IPVersion.V4Only)
        local_ip = self._get_local_ip()
        ip_packed = socket.inet_aton(local_ip)

        http_type = "_http._tcp.local."
        http_name = f"TriviaMQTT Web ({hostname}).{http_type}"
        http_service = ServiceInfo(
            type_=http_type,
            name=http_name,
            addresses=[ip_packed],
            port=config.APP_PORT,
            properties={"path": "/setup"},
            server=f"{hostname}.local.",
        )
        self._zeroconf.register_service(http_service)
        self._services.append(http_service)

        mqtt_type = "_mqtt._tcp.local."
        mqtt_name = f"TriviaMQTT MQTT ({hostname}).{mqtt_type}"
        mqtt_service = ServiceInfo(
            type_=mqtt_type,
            name=mqtt_name,
            addresses=[ip_packed],
            port=config.MQTT_BROKER_PORT,
            properties={},
            server=f"{hostname}.local.",
        )
        self._zeroconf.register_service(mqtt_service)
        self._services.append(mqtt_service)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None
        self._clear_services()

    def _clear_services(self) -> None:
        if self._zeroconf is None:
            return
        for service in self._services:
            try:
                self._zeroconf.unregister_service(service)
            except Exception:
                pass
        self._services.clear()
        try:
            self._zeroconf.close()
        except Exception:
            pass
        self._zeroconf = None

    @staticmethod
    def _get_local_ip() -> str:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
        except Exception:
            return "127.0.0.1"
        finally:
            probe.close()


mdns_service = MDNSService()
