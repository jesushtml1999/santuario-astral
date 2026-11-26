"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Heart, House, KeyRound, MessageCircle } from "lucide-react";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { unreadMessages } from "@/lib/chatNotifications";

const tabs = [
  { view: "inicio", label: "Inicio", href: "/catalogo", icon: House },
  {
    view: "chats",
    label: "Mis Chats",
    href: "/catalogo?vista=chats",
    icon: MessageCircle,
  },
  {
    view: "favoritos",
    label: "Favoritos",
    href: "/catalogo?vista=favoritos",
    icon: Heart,
  },
  {
    view: "maestros",
    label: "Acceso Maestros",
    href: "/maestro/login",
    icon: KeyRound,
  },
] as const;

export default function BottomNav() {
  const notifications = useChatNotifications();
  const unread = notifications.role === "cliente" ? unreadMessages(notifications) : 0;
  const pathname = usePathname();
  const requestedView = useSearchParams().get("vista");
  const view = tabs.some((tab) => tab.view === requestedView)
    ? requestedView
    : "inicio";

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="bottom-nav-inner">
        {tabs.map(({ view: tab, label, href, icon: Icon }) => {
          const active =
            ((pathname === "/catalogo" || pathname === "/") && view === tab) ||
            (pathname.startsWith("/chat/") && tab === "chats");
          return (
            <Link
              key={tab}
              href={href}
              className={`nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={21}
                strokeWidth={active ? 1.9 : 1.5}
                aria-hidden="true"
              />
              <span>{label}</span>
              {tab === "chats" && unread > 0 && (
                <span className="nav-unread-badge" aria-label={`${unread} mensajes sin leer`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
