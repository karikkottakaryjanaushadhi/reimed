"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StoreSwitcher } from "./StoreSwitcher";

type NavLeaf = {
  href: string;
  label: string;
  /** Hidden from cashiers when true. */
  manager?: boolean;
  /** Extra paths that should highlight this item (e.g. redirect targets). */
  matchesPath?: (pathname: string) => boolean;
};

function visibleNavItems(items: NavLeaf[], isManager: boolean): NavLeaf[] {
  return items.filter((item) => !item.manager || isManager);
}

const shopDetailsPath =
  (pathname: string) =>
    pathname === "/dashboard/stores/edit" || /^\/dashboard\/stores\/[^/]+\/edit$/.test(pathname);

type NavMenuDef = {
  type: "menu";
  label: string;
  manager?: boolean;
  items: NavLeaf[];
};

type NavLinkDef = { type: "link"; href: string; label: string; manager?: boolean };

const navConfig: (NavLinkDef | NavMenuDef)[] = [
  { type: "link", href: "/dashboard", label: "Overview" },
  {
    type: "menu",
    label: "Billing",
    items: [
      { href: "/dashboard/pos", label: "POS (new bill)" },
      { href: "/dashboard/sales", label: "Sales history" },
      { href: "/dashboard/sales/productwise", label: "Product-wise sales" },
      { href: "/dashboard/sales/returns", label: "Sales returns" },
      {
        href: "/dashboard/margins",
        label: "Margin details",
        manager: true,
        matchesPath: (pathname) => pathname.startsWith("/dashboard/margins"),
      },
    ],
  },
  {
    type: "menu",
    label: "Purchases",
    manager: true,
    items: [
      { href: "/dashboard/purchases/new", label: "New purchase" },
      { href: "/dashboard/purchases", label: "Purchase list" },
      { href: "/dashboard/purchases/returns", label: "Purchase returns" },
    ],
  },
  {
    type: "menu",
    label: "Catalog",
    manager: true,
    items: [
      { href: "/dashboard/products", label: "Products" },
      { href: "/dashboard/products/new", label: "Add product" },
      { href: "/dashboard/brands", label: "Brands" },
      { href: "/dashboard/brands/new", label: "Add brand" },
      { href: "/dashboard/suppliers", label: "Suppliers" },
      { href: "/dashboard/suppliers/new", label: "Add supplier" },
    ],
  },
  {
    type: "menu",
    label: "Inventory",
    items: [
      { href: "/dashboard/inventory/batches", label: "Batches & expiry" },
      { href: "/dashboard/inventory/stock", label: "Stock levels" },
      { href: "/dashboard/inventory/add-stock", label: "Add to stock", manager: true },
      { href: "/dashboard/transfers", label: "Transfers" },
    ],
  },
  {
    type: "menu",
    label: "Store admin",
    manager: true,
    items: [
      { href: "/dashboard/staff", label: "Staff" },
      { href: "/dashboard/staff/new", label: "Add staff" },
      { href: "/dashboard/stores", label: "Stores" },
      {
        href: "/dashboard/stores/edit",
        label: "Shop Details",
        matchesPath: shopDetailsPath,
      },
      { href: "/dashboard/stores/new", label: "Register store" },
    ],
  },
];

/** Single "current" sub-route: exact match, or under `href/` — longest `href` wins (e.g. list vs …/new). */
function activeItemHref(pathname: string, items: NavLeaf[]): string | null {
  const customHits = items.filter((i) => i.matchesPath?.(pathname));
  if (customHits.length > 0) {
    return customHits.reduce((a, b) => (a.href.length >= b.href.length ? a : b)).href;
  }

  const hits = items.filter((i) => {
    if (pathname === i.href) return true;
    if (i.href === "/dashboard") return false;
    return pathname.startsWith(`${i.href}/`);
  });
  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (a.href.length >= b.href.length ? a : b)).href;
}

function navLinkClass(active: boolean, variant: "desktop" | "drawer-item" | "drawer-top") {
  if (variant === "desktop") {
    return `rounded-lg px-2.5 py-2.5 ${
      active
        ? "bg-brand-blue/20 text-white ring-1 ring-brand-green/40"
        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
    }`;
  }
  if (variant === "drawer-top") {
    return `block rounded-lg px-3 py-3 text-base font-medium ${
      active
        ? "bg-brand-blue/25 text-white ring-1 ring-brand-green/40"
        : "text-zinc-200 hover:bg-zinc-900"
    }`;
  }
  return `block rounded-lg px-3 py-2.5 text-sm ${
    active
      ? "bg-brand-blue/25 font-medium text-white"
      : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
  }`;
}

function NavMenu({
  label,
  items,
  pathname,
  open,
  onOpenChange,
  variant,
}: {
  label: string;
  items: NavLeaf[];
  pathname: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  variant: "desktop" | "drawer";
}) {
  const currentHref = activeItemHref(pathname, items);
  const menuHighlighted = currentHref !== null;
  const panelId = useId();

  if (variant === "drawer") {
    return (
      <div className="border-t border-zinc-800 pt-3 first:border-t-0 first:pt-0">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const itemActive = currentHref === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href} className={navLinkClass(itemActive, "drawer-item")}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={`flex items-center gap-1 ${navLinkClass(menuHighlighted, "desktop")}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[12.5rem] rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
        >
          {items.map((item) => {
            const itemActive = currentHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-3 py-2 text-sm ${
                  itemActive
                    ? "bg-brand-blue/25 font-medium text-white"
                    : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }`}
                onClick={() => onOpenChange(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {open ? (
        <>
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </>
      ) : (
        <>
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </>
      )}
    </svg>
  );
}

export function AppNav({
  stores,
  activeStoreId,
  isManager,
}: {
  stores: { id: string; name: string; role: string }[];
  activeStoreId: string;
  isManager: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setOpenMenuKey(null);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (openMenuKey === null) return;
    function onPointerDown(e: PointerEvent) {
      const el = e.target as Node | null;
      if (el && navRef.current?.contains(el)) return;
      setOpenMenuKey(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenuKey]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const visibleNav = navConfig.filter((entry) => !entry.manager || isManager);
  const drawerId = "app-nav-drawer";

  return (
    <header className="border-b border-zinc-800 bg-black">
      <div className="mx-auto flex w-full max-w-[1520px] items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-10">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="touch-manipulation rounded-lg p-2 text-zinc-300 hover:bg-zinc-900 md:hidden"
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <MenuIcon open={drawerOpen} />
          </button>
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            <Image
              src="/medseb-logo.png"
              alt="MedSeb Pharmacy POS"
              width={320}
              height={82}
              className="h-10 w-auto drop-shadow-[0_2px_12px_rgba(0,120,215,0.45)] sm:h-16"
              priority
            />
          </Link>
          <div className="min-w-0 flex-1 sm:flex-none">
            <StoreSwitcher stores={stores} activeStoreId={activeStoreId} />
          </div>
        </div>

        <nav ref={navRef} className="hidden flex-wrap items-center gap-1 text-sm md:flex">
          {visibleNav.map((entry) => {
            if (entry.type === "link") {
              const active = pathname === entry.href;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={navLinkClass(active, "desktop")}
                  onClick={() => setOpenMenuKey(null)}
                >
                  {entry.label}
                </Link>
              );
            }
            const menuKey = entry.label;
            const items = visibleNavItems(entry.items, isManager);
            if (items.length === 0) return null;
            return (
              <NavMenu
                key={menuKey}
                label={menuKey}
                items={items}
                pathname={pathname}
                open={openMenuKey === menuKey}
                onOpenChange={(next) => setOpenMenuKey(next ? menuKey : null)}
                variant="desktop"
              />
            );
          })}
          <button
            type="button"
            onClick={() => void logout()}
            className="ml-2 rounded-lg px-2.5 py-2.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          >
            Log out
          </button>
        </nav>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[90] md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute left-0 top-0 flex h-full w-[min(100%,20rem)] flex-col border-r border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-200">Menu</span>
              <button
                type="button"
                className="touch-manipulation rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <MenuIcon open={true} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {visibleNav.map((entry) => {
                if (entry.type === "link") {
                  const active = pathname === entry.href;
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className={navLinkClass(active, "drawer-top")}
                      onClick={() => setDrawerOpen(false)}
                    >
                      {entry.label}
                    </Link>
                  );
                }
                const items = visibleNavItems(entry.items, isManager);
                if (items.length === 0) return null;
                return (
                  <NavMenu
                    key={entry.label}
                    label={entry.label}
                    items={items}
                    pathname={pathname}
                    open={false}
                    onOpenChange={() => {}}
                    variant="drawer"
                  />
                );
              })}
            </nav>
            <div className="border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => void logout()}
                className="touch-manipulation w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Log out
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
