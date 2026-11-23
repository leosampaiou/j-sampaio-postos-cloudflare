import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  businessDateInSaoPaulo,
  lastDayOfMonth,
  shiftCalendarDate,
} from "@shared/businessDate";
import { FuelTypeBadge } from "@/components/FuelType";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { shareClosurePdf } from "@/lib/closurePdf";
import {
  openClosurePrintWindow,
  type ClosurePrintInput,
} from "@/lib/closurePrint";
import QueryError from "@/components/QueryError";
import { exportReportXlsx } from "@/lib/reportExport";
import {
  clearOfflineDraft,
  readOfflineDraft,
  saveOfflineDraft,
} from "@/lib/offlineDraft";
import {
  toClosureParticipantPayload,
  toggleClosureParticipant,
} from "@/lib/closureParticipants";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  FileBarChart2,
  FileCheck2,
  Fuel,
  Gauge,
  History,
  Home as HomeIcon,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import StockPage from "@/pages/StockPage";
import DiscrepanciesPage from "@/pages/DiscrepanciesPage";
import TankStockOverview from "@/components/TankStockOverview";

type User = {
  id: number;
  unitId: number;
  username: string;
  fullName: string;
  role: "frentista" | "gerente" | "administrador";
  active: boolean;
};
const brl = (cents: number) =>
  ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const liters = (n: number) =>
  `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L`;
const shiftLabel = (s: string) =>
  (
    ({ manha: "Manhã", tarde: "Tarde", noite: "Noite" }) as Record<
      string,
      string
    >
  )[s] ?? s;
const resultLabel = (s: string) =>
  (
    ({
      conferido: "Conferido",
      sobra: "Sobra",
      falta: "Falta",
      pendente: "Pendente",
    }) as Record<string, string>
  )[s] ?? s;
const statusLabel = (s: string) =>
  (
    ({
      rascunho: "Em preenchimento",
      aguardando_conferencia: "Aguardando conferência",
      finalizado: "Finalizado",
      reaberto: "Reaberto",
      nao_iniciado: "Não iniciado",
    }) as Record<string, string>
  )[s] ?? s;
const dateToday = () => businessDateInSaoPaulo();
const dateLabel = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
const toCents = (value: string) => {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const inputCurrency = (cents: number) =>
  ((cents || 0) / 100).toFixed(2).replace(".", ",");
const nav = [
  {
    href: "/",
    label: "Visão geral",
    icon: Gauge,
    roles: ["frentista", "gerente", "administrador"],
  },
  {
    href: "/fechamento/novo",
    label: "Novo fechamento",
    icon: Plus,
    roles: ["frentista", "gerente", "administrador"],
  },
  {
    href: "/historico",
    label: "Histórico",
    icon: History,
    roles: ["frentista", "gerente", "administrador"],
  },
  {
    href: "/estoque",
    label: "Estoque e tanques",
    icon: Fuel,
    roles: ["gerente", "administrador"],
  },
  {
    href: "/divergencias",
    label: "Controle de divergências",
    icon: CircleAlert,
    roles: ["frentista", "gerente", "administrador"],
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: FileBarChart2,
    roles: ["gerente", "administrador"],
  },
  {
    href: "/funcionarios",
    label: "Funcionários",
    icon: Users,
    roles: ["gerente", "administrador"],
  },
  {
    href: "/usuarios",
    label: "Usuários e permissões",
    icon: UserCog,
    roles: ["administrador"],
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ["administrador"],
  },
  {
    href: "/auditoria",
    label: "Auditoria",
    icon: ShieldCheck,
    roles: ["administrador"],
  },
];
const roleLabel = (r: string) =>
  (
    ({
      frentista: "Frentista",
      gerente: "Gerente",
      administrador: "Administrador",
    }) as Record<string, string>
  )[r] ?? r;

export default function Home({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const settings = trpc.settings.get.useQuery();
  const offlineSync = trpc.closures.saveDraft.useMutation();
  const syncLock = useRef(false);
  const utils = trpc.useUtils();
  useEffect(() => {
    const syncQueued = async () => {
      if (!navigator.onLine || syncLock.current) return;
      const payload = readOfflineDraft(user.id);
      if (!payload) return;
      syncLock.current = true;
      try {
        await offlineSync.mutateAsync(payload);
        clearOfflineDraft(user.id);
        await Promise.all([
          utils.closures.list.invalidate(),
          utils.closures.listPage.invalidate(),
        ]);
        toast.success("Rascunho offline sincronizado com o servidor.");
      } catch (error: any) {
        toast.error(
          error.message ??
            "O rascunho local foi mantido; tente sincronizar novamente."
        );
      } finally {
        syncLock.current = false;
      }
    };
    const on = () => {
        setOnline(true);
        void syncQueued();
      },
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (navigator.onLine) void syncQueued();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [user.id, offlineSync.mutateAsync, utils]);
  const permitted = nav.filter(n => n.roles.includes(user.role));
  const primaryNav = permitted.filter(item =>
    ["/", "/fechamento/novo", "/historico", "/divergencias"].includes(item.href)
  );
  const managementNav = permitted.filter(item => !primaryNav.includes(item));
  const renderNavItems = (items: typeof permitted) =>
    items.map(item => {
      const Icon = item.icon;
      const active =
        location === item.href ||
        (item.href === "/fechamento/novo" &&
          location.startsWith("/fechamento"));
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-link ${active ? "active" : ""}`}
          aria-current={active ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
        >
          <Icon size={18} />
          <span>{item.label}</span>
          {active && <span className="active-mark" />}
        </Link>
      );
    });
  const mobileNavItems =
    user.role === "frentista"
      ? [
          { href: "/", label: "Início", icon: HomeIcon },
          { href: "/historico", label: "Fechamentos", icon: History },
          { href: "/fechamento/novo", label: "Novo", icon: Plus },
          { href: "/divergencias", label: "Minhas", icon: CircleAlert },
        ]
      : [
          { href: "/", label: "Início", icon: HomeIcon },
          { href: "/historico", label: "Fechamentos", icon: History },
          { href: "/fechamento/novo", label: "Novo", icon: Plus },
          { href: "/estoque", label: "Estoque", icon: Fuel },
        ];
  const mobileNavHrefs = new Set(mobileNavItems.map(item => item.href));
  const moreNavActive = permitted.some(
    item => item.href === location && !mobileNavHrefs.has(item.href)
  );
  const pageTitle =
    permitted.find(n => n.href === location)?.label ??
    (location.startsWith("/fechamento/editar")
      ? "Editar fechamento"
      : location.startsWith("/fechamento")
        ? "Novo fechamento"
        : "Visão geral");
  const editMatch = location.match(/^\/fechamento\/editar\/(\d+)$/);
  let content: React.ReactNode;
  if (location === "/fechamento/novo") content = <ClosureForm user={user} />;
  else if (editMatch)
    content = <ClosureForm user={user} closureId={Number(editMatch[1])} />;
  else if (location === "/historico") content = <HistoryPage user={user} />;
  else if (location === "/estoque" && user.role === "frentista")
    content = (
      <PageHeading
        eyebrow="ACESSO RESTRITO"
        title="Estoque e tanques"
        description="O estoque geral está disponível somente para gerentes e administradores."
      />
    );
  else if (location === "/estoque") content = <StockPage user={user} />;
  else if (location === "/divergencias")
    content = <DiscrepanciesPage user={user} />;
  else if (location === "/relatorios" && user.role !== "frentista")
    content = <ReportsPage />;
  else if (location === "/funcionarios" && user.role !== "frentista")
    content = <EmployeesPage />;
  else if (location === "/usuarios" && user.role === "administrador")
    content = <UsersPage />;
  else if (location === "/configuracoes" && user.role === "administrador")
    content = <SettingsPage />;
  else if (location === "/auditoria" && user.role === "administrador")
    content = <AuditPage />;
  else content = <Dashboard user={user} />;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/logo-jsampaio.png" alt="J Sampaio Postos" />
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="unit-pill">
          <span className="unit-dot" />{" "}
          {settings.data?.unit?.tradeName ?? "J SAMPAIO POSTOS"}
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">ROTINA</span>
        <nav className="side-nav">{renderNavItems(primaryNav)}</nav>
        {managementNav.length > 0 && (
          <>
            <span className="nav-caption nav-caption-secondary">GESTÃO</span>
            <nav className="side-nav">{renderNavItems(managementNav)}</nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className={`connection-chip ${online ? "online" : "offline"}`}>
            <span />
            {online ? "Conectado" : "Sem conexão"}
            <span className="connection-note">
              {online
                ? "Dados sincronizados"
                : "Rascunhos temporários nesta aba"}
            </span>
          </div>
          <div className="user-mini">
            <div className="avatar-initials">
              {user.fullName
                .split(" ")
                .map(s => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="user-mini-info">
              <strong>{user.fullName}</strong>
              <small>{roleLabel(user.role)}</small>
            </div>
            <button
              className="icon-button logout-button"
              title="Sair"
              aria-label="Sair da conta"
              onClick={() => {
                if (window.confirm("Deseja realmente encerrar sua sessão?"))
                  void onLogout().catch(() =>
                    toast.error("Não foi possível encerrar a sessão.")
                  );
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Fechar navegação"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>J Sampaio Postos</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`network-status ${online ? "" : "network-offline"}`}
            >
              <i />
              {online ? "Online" : "Offline"}
            </span>
            <button
              className="icon-button"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell size={18} />
            </button>
            <div className="topbar-date">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </div>
          </div>
        </header>
        <div className="page-content">{content}</div>
      </main>
      <nav className="mobile-bottom-nav">
        {mobileNavItems.map(item => {
          const Icon = item.icon;
          const active =
            location === item.href ||
            (item.href === "/estoque" && location.startsWith("/estoque"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "selected" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={moreOpen || moreNavActive ? "selected" : ""}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          aria-label={moreOpen ? "Fechar mais opções" : "Abrir mais opções"}
          onClick={() => setMoreOpen(value => !value)}
        >
          <MoreHorizontal size={19} />
          <span>Mais</span>
        </button>
        {moreOpen && (
          <div id="mobile-more-menu" className="mobile-more-menu" role="menu">
            {permitted
              .filter(item => !mobileNavHrefs.has(item.href))
              .map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        )}
      </nav>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "navy",
  valueClassName = "",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  tone?: string;
  valueClassName?: string;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={19} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong className={valueClassName}>{value}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </article>
  );
}
function EmptyPanel({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: any;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-panel">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const [range, setRange] = useState("month");
  const [customFrom, setCustomFrom] = useState(dateToday());
  const [customTo, setCustomTo] = useState(dateToday());
  const today = dateToday();
  const currentMonthEnd = lastDayOfMonth(today);
  const yesterday = shiftCalendarDate(today, -1);
  const previousMonthTo = shiftCalendarDate(`${today.slice(0, 7)}-01`, -1);
  const from =
    range === "custom"
      ? customFrom
      : range === "today"
        ? today
        : range === "yesterday"
          ? yesterday
          : range === "previousMonth"
            ? `${previousMonthTo.slice(0, 7)}-01`
            : range === "month"
              ? `${today.slice(0, 7)}-01`
              : range === "30"
                ? shiftCalendarDate(today, -29)
                : shiftCalendarDate(today, -6);
  const to =
    range === "custom"
      ? customTo
      : range === "yesterday"
        ? yesterday
        : range === "previousMonth"
          ? previousMonthTo
          : range === "month"
            ? currentMonthEnd
            : today;
  const validCustomRange =
    range !== "custom" ||
    (Boolean(customFrom && customTo) && customFrom <= customTo);
  const analytics = trpc.analytics.dashboard.useQuery(
    { from, to },
    { enabled: user.role !== "frentista" && validCustomRange, retry: false }
  );
  const own = trpc.closures.list.useQuery(undefined, {
    enabled: user.role === "frentista",
  });
  if (user.role === "frentista")
    return (
      <>
        <PageHeading
          eyebrow="ÁREA OPERACIONAL"
          title={`Olá, ${user.fullName.split(" ")[0]}`}
          description="Acompanhe seus turnos e inicie um novo fechamento."
          action={
            <Button
              className="primary-button"
              onClick={() => (location.href = "/fechamento/novo")}
            >
              <Plus size={17} /> Novo fechamento
            </Button>
          }
        />
        <div className="frontline-banner">
          <div className="frontline-icon">
            <ClipboardList size={20} />
          </div>
          <div>
            <strong>Seu próximo fechamento começa aqui</strong>
            <span>
              Registre as leituras, informe os recebimentos e confira a
              diferença antes de enviar.
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => (location.href = "/fechamento/novo")}
          >
            Iniciar <ArrowRight size={16} />
          </Button>
        </div>
        <section className="section-block">
          <SectionTitle
            title="Meus fechamentos recentes"
            action={
              <Link href="/historico" className="inline-link">
                Ver histórico <ArrowRight size={15} />
              </Link>
            }
          />
          <ClosureTable
            rows={own.data ?? []}
            loading={own.isLoading}
            error={own.isError}
            retry={() => own.refetch()}
            compact
          />
        </section>
      </>
    );
  const data = validCustomRange ? analytics.data : undefined;
  const metricsUnavailable =
    analytics.isLoading || analytics.isError || !validCustomRange;
  const totals = data?.totals;
  const displayMoney = (value?: number) =>
    metricsUnavailable ? "—" : brl(value ?? 0);
  const displayLiters = (value?: number) =>
    metricsUnavailable ? "—" : liters(value ?? 0);
  const chart =
    data?.byDay.map(row => ({
      ...row,
      label: new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      }),
    })) ?? [];
  const balance = totals?.netCashBalanceCents ?? 0;
  const balanceTone = balance > 0 ? "green" : balance < 0 ? "red" : "navy";
  const balanceStatus = analytics.isError
    ? "Falha ao carregar"
    : analytics.isLoading
      ? "Carregando…"
      : !validCustomRange
        ? "Período inválido"
        : balance > 0
          ? "Saldo positivo"
          : balance < 0
            ? "Saldo negativo"
            : "Saldo zerado";
  const balanceValueClassName =
    balance > 0 ? "text-success" : balance < 0 ? "text-danger" : "";
  const periodLabel =
    (
      {
        today: "hoje",
        yesterday: "ontem",
        "7": "últimos 7 dias",
        "30": "últimos 30 dias",
        month: "mês atual",
        previousMonth: "mês anterior",
        custom: "período personalizado",
      } as Record<string, string>
    )[range] ?? "período selecionado";
  const pie = data
    ? Object.entries(data.paymentStats)
        .map(([name, value]) => ({
          name: (
            {
              dinheiro: "Dinheiro",
              pix: "PIX",
              debito: "Débito",
              credito: "Crédito",
            } as Record<string, string>
          )[name],
          value,
        }))
        .filter(x => x.value > 0)
    : [];
  const colors = ["#173b7a", "#eab308", "#3aa675", "#fa9341"];
  return (
    <>
      <PageHeading
        eyebrow="PAINEL DE OPERAÇÃO"
        title="Visão geral"
        description="Acompanhe o movimento do posto e a situação dos fechamentos."
        action={
          <div className="heading-actions">
            <Label htmlFor="dashboard-range" className="sr-only">
              Período do dashboard
            </Label>
            <select
              id="dashboard-range"
              className="select-control"
              value={range}
              onChange={e => setRange(e.target.value)}
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="month">Mês atual</option>
              <option value="previousMonth">Mês anterior</option>
              <option value="custom">Período personalizado</option>
            </select>
            <button
              className="icon-button refresh-button"
              title="Atualizar"
              aria-label="Atualizar indicadores"
              onClick={() => analytics.refetch()}
              disabled={!validCustomRange}
            >
              <Activity size={18} />
            </button>
          </div>
        }
      />
      {analytics.isError && (
        <QueryError
          message="O dashboard não respondeu. Os valores não foram substituídos por zeros; tente carregar novamente."
          retry={() => analytics.refetch()}
        />
      )}
      {range === "custom" && (
        <div className="custom-period-controls">
          <div className="field">
            <Label htmlFor="dashboard-period-from">De</Label>
            <Input
              id="dashboard-period-from"
              type="date"
              value={customFrom}
              max={today}
              onChange={event => setCustomFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <Label htmlFor="dashboard-period-to">Até</Label>
            <Input
              id="dashboard-period-to"
              type="date"
              value={customTo}
              max={today}
              onChange={event => setCustomTo(event.target.value)}
            />
          </div>
          {!validCustomRange && (
            <p className="inline-alert warning-alert" role="alert">
              Informe um período válido, com a data inicial igual ou anterior à
              final.
            </p>
          )}
        </div>
      )}
      <div className="quick-actions">
        <Link href="/fechamento/novo" className="quick-primary">
          <Plus size={17} /> Novo fechamento <ArrowRight size={16} />
        </Link>
        <Link href="/historico" className="quick-secondary">
          <History size={16} /> Consultar histórico
        </Link>
        <Link href="/relatorios" className="quick-secondary">
          <FileBarChart2 size={16} /> Relatórios
        </Link>
      </div>
      <div className="dashboard-metric-groups">
        <section
          className="dashboard-metric-group"
          aria-labelledby="metrics-today-title"
        >
          <div className="dashboard-metric-heading">
            <h2 id="metrics-today-title">Hoje</h2>
            <span>{dateLabel(today)}</span>
          </div>
          <div className="stats-grid">
            <StatCard
              label="Faturamento hoje"
              value={displayMoney(totals?.todaySalesCents)}
              icon={Banknote}
              tone="navy"
            />
            <StatCard
              label="Litros vendidos hoje"
              value={displayLiters(totals?.todayLiters)}
              icon={Fuel}
              tone="blue"
            />
          </div>
        </section>
        <section
          className="dashboard-metric-group"
          aria-labelledby="metrics-period-title"
        >
          <div className="dashboard-metric-heading">
            <h2 id="metrics-period-title">Período selecionado</h2>
            <span>{periodLabel}</span>
          </div>
          <div className="stats-grid">
            <StatCard
              label="Faturamento no período"
              value={displayMoney(totals?.monthSalesCents)}
              icon={Wallet}
              tone="yellow"
            />
            <StatCard
              label="Litros no período"
              value={displayLiters(totals?.monthLiters)}
              icon={Fuel}
              tone="blue"
            />
            <StatCard
              label="Saldo de caixa"
              value={metricsUnavailable ? "—" : brl(balance)}
              sub={balanceStatus}
              icon={Wallet}
              tone={balanceTone}
              valueClassName={balanceValueClassName}
            />
          </div>
        </section>
      </div>
      <TankStockOverview />
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <SectionTitle
            title="Evolução do faturamento"
            subtitle="Fechamentos finalizados no período"
          />
          {metricsUnavailable ? (
            <div className="query-data-state" role="status">
              {analytics.isLoading
                ? "Carregando dados do período…"
                : "Dados indisponíveis por falha na consulta."}
            </div>
          ) : chart.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chart}
                  margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="revenueFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#183b78" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#183b78" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e9edf3"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#7b8492" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#7b8492" }}
                    tickFormatter={n => `R$${Math.round(n / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(v: any) => brl(Number(v))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e6eaf0",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="salesCents"
                    name="Faturamento"
                    stroke="#183b78"
                    strokeWidth={2.5}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyPanel
              icon={Activity}
              title="Sem fechamentos no período"
              detail="Os dados do gráfico aparecerão quando houver fechamentos finalizados."
            />
          )}
        </section>
        <section className="panel shift-panel">
          <SectionTitle
            title="Acompanhamento dos turnos"
            subtitle={dateLabel(today)}
          />
          <div className="shift-list">
            {metricsUnavailable ? (
              <div className="query-data-state" role="status">
                {analytics.isLoading
                  ? "Carregando turnos…"
                  : "Turnos indisponíveis por falha na consulta."}
              </div>
            ) : (
              (
                data?.shifts ??
                ["manha", "tarde", "noite"].map(shift => ({
                  shift,
                  status: "nao_iniciado",
                  result: "pendente",
                }))
              ).map((s: any) => (
                <div className="shift-row" key={s.shift}>
                  <div
                    className={`shift-icon ${s.status === "finalizado" ? "done" : s.status === "aguardando_conferencia" ? "waiting" : ""}`}
                  >
                    {s.status === "finalizado" ? (
                      <Check size={17} />
                    ) : (
                      <Clock3 size={17} />
                    )}
                  </div>
                  <div className="shift-main">
                    <strong>{shiftLabel(s.shift)}</strong>
                    <small>
                      {s.status === "finalizado"
                        ? resultLabel(s.result)
                        : statusLabel(s.status)}
                    </small>
                  </div>
                  <span
                    className={`status-badge ${s.status === "finalizado" ? "success" : s.status === "aguardando_conferencia" ? "warning" : "neutral"}`}
                  >
                    {statusLabel(s.status)}
                  </span>
                </div>
              ))
            )}
          </div>
          <Link href="/historico" className="panel-footer-link">
            Ver fechamentos <ArrowRight size={15} />
          </Link>
        </section>
        <section className="panel fuel-panel">
          <SectionTitle
            title="Vendas por combustível"
            subtitle="Volume e faturamento"
          />
          {metricsUnavailable ? (
            <div className="query-data-state" role="status">
              {analytics.isLoading
                ? "Carregando vendas…"
                : "Vendas indisponíveis por falha na consulta."}
            </div>
          ) : data && Object.values(data.fuelStats).some(v => v.liters > 0) ? (
            <div className="fuel-bars">
              {Object.entries(data.fuelStats).map(([key, val]) => (
                <div className="fuel-item" key={key}>
                  <div className="fuel-item-head">
                    <span>
                      <FuelTypeBadge fuelType={key} />
                    </span>
                    <strong>{liters(val.liters)}</strong>
                  </div>
                  <div className="meter">
                    <span
                      style={{
                        width: `${Math.min(100, Math.max(4, (val.liters / (data.totals.monthLiters || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <small>{brl(val.valueCents)}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel
              icon={Fuel}
              title="Sem vendas registradas"
              detail="O comparativo será calculado a partir das leituras dos bicos."
            />
          )}
        </section>
        <section className="panel payment-panel">
          <SectionTitle
            title="Formas de recebimento"
            subtitle="Distribuição no período"
          />
          {metricsUnavailable ? (
            <div className="query-data-state" role="status">
              {analytics.isLoading
                ? "Carregando recebimentos…"
                : "Recebimentos indisponíveis por falha na consulta."}
            </div>
          ) : pie.length ? (
            <>
              <div className="payment-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={4}
                    >
                      {pie.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={colors[index % colors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => brl(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="payment-total">
                  <strong>{brl(totals?.monthReceivedCents ?? 0)}</strong>
                  <small>recebido</small>
                </div>
              </div>
              <div className="legend-list">
                {pie.map((p, i) => (
                  <div key={p.name}>
                    <span>
                      <i style={{ background: colors[i % colors.length] }} />
                      {p.name}
                    </span>
                    <strong>{brl(p.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyPanel
              icon={Wallet}
              title="Sem recebimentos no período"
              detail="Os valores serão exibidos após o primeiro fechamento."
            />
          )}
        </section>
      </div>
    </>
  );
}
function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {action}
    </div>
  );
}

function ClosureForm({ user, closureId }: { user: User; closureId?: number }) {
  const [step, setStep] = useState(1);
  const [closureDate, setClosureDate] = useState(dateToday());
  const [shift, setShift] = useState("manha");
  const [employeeId, setEmployeeId] = useState("");
  const [responsibleName, setResponsibleName] = useState(user.fullName);
  const [notes, setNotes] = useState("");
  const [employeeConfirmed, setEmployeeConfirmed] = useState(false);
  const [responsibleConfirmed, setResponsibleConfirmed] = useState(false);
  const [participants, setParticipants] = useState<
    Array<{ employeeId: number; sharePercent: string }>
  >([]);
  const [readings, setReadings] = useState<
    Record<number, { initial: string; final: string }>
  >({});
  const [paymentValues, setPaymentValues] = useState({
    dinheiro: "0,00",
    pix: "0,00",
    debito: "0,00",
    credito: "0,00",
  });
  const [changeReason, setChangeReason] = useState("");
  const [loadedClosureId, setLoadedClosureId] = useState<number | null>(null);
  const initialParticipantSelection = useRef(false);
  const pumps = trpc.settings.pumps.useQuery();
  const staff = trpc.employees.list.useQuery();
  const participantOptions = trpc.employees.participantOptions.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.closures.saveDraft.useMutation();
  const finalize = trpc.closures.finalize.useMutation();
  const editing = trpc.closures.detail.useQuery(
    { id: closureId ?? 0 },
    { enabled: Boolean(closureId) }
  );
  useEffect(() => {
    if (
      closureId ||
      initialParticipantSelection.current ||
      staff.isLoading ||
      staff.isError ||
      participantOptions.isLoading ||
      participantOptions.isError
    )
      return;
    const available = (staff.data ?? []).filter(e => e.active);
    const employee =
      available.find(e => e.linkedUserId === user.id) ?? available[0];
    if (employee) {
      setEmployeeId(String(employee.id));
      setParticipants([{ employeeId: employee.id, sharePercent: "100" }]);
    }
    initialParticipantSelection.current = true;
  }, [
    closureId,
    staff.data,
    staff.isLoading,
    staff.isError,
    participantOptions.isLoading,
    participantOptions.isError,
    user.id,
  ]);
  useEffect(() => {
    const saved = editing.data;
    if (!closureId || !saved || loadedClosureId === closureId) return;
    setClosureDate(saved.closureDate);
    setShift(saved.shift);
    setEmployeeId(String(saved.employeeId));
    setParticipants(
      (saved.participants?.length
        ? saved.participants
        : [{ employeeId: saved.employeeId, sharePercent: 100 }]
      ).map((item: any) => ({
        employeeId: item.employeeId,
        sharePercent:
          (saved.participants?.length ?? 0) <= 1
            ? "100"
            : String(item.sharePercent),
      }))
    );
    setResponsibleName(saved.responsibleName);
    setNotes(saved.notes ?? "");
    setEmployeeConfirmed(saved.employeeConfirmed);
    setResponsibleConfirmed(saved.responsibleConfirmed);
    setReadings(
      Object.fromEntries(
        saved.nozzles.map((n: any) => [
          n.pumpId,
          { initial: String(n.initialReading), final: String(n.finalReading) },
        ])
      )
    );
    setPaymentValues({
      dinheiro: inputCurrency(
        saved.payments.find((p: any) => p.method === "dinheiro")?.amountCents ??
          0
      ),
      pix: inputCurrency(
        saved.payments.find((p: any) => p.method === "pix")?.amountCents ?? 0
      ),
      debito: inputCurrency(
        saved.payments.find((p: any) => p.method === "debito")?.amountCents ?? 0
      ),
      credito: inputCurrency(
        saved.payments.find((p: any) => p.method === "credito")?.amountCents ??
          0
      ),
    });
    setLoadedClosureId(closureId);
  }, [closureId, editing.data, loadedClosureId]);
  const calculated = (pumps.data ?? []).map(p => {
    const v = readings[p.id] ?? { initial: "0", final: "0" };
    const initial = Number(v.initial.replace(",", ".")) || 0;
    const final = Number(v.final.replace(",", ".")) || 0;
    const liters = Math.max(0, final - initial);
    const priceCents = closureId
      ? (editing.data?.nozzles.find((n: any) => n.pumpId === p.id)
          ?.priceCents ?? p.priceCents)
      : p.priceCents;
    return {
      ...p,
      priceCents,
      initial,
      final,
      liters,
      valueCents: Math.round(liters * priceCents),
    };
  });
  const salesCents = calculated.reduce((s, p) => s + p.valueCents, 0);
  const payments = ["dinheiro", "pix", "debito", "credito"].map(method => ({
    method: method as keyof typeof paymentValues,
    amountCents: toCents(paymentValues[method as keyof typeof paymentValues]),
  }));
  const receivedCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const difference = receivedCents - salesCents;
  const handleReading = (
    id: number,
    field: "initial" | "final",
    value: string
  ) =>
    setReadings(old => ({
      ...old,
      [id]: { ...(old[id] ?? { initial: "0", final: "0" }), [field]: value },
    }));
  const toggleParticipant = (id: number, selected: boolean) => {
    setParticipants(current => toggleClosureParticipant(current, id, selected));
    if (user.role === "frentista") return;
    setEmployeeId(currentEmployeeId => {
      if (selected) return currentEmployeeId || String(id);
      if (Number(currentEmployeeId) !== id) return currentEmployeeId;
      const next = participants.filter(person => person.employeeId !== id);
      return next[0] ? String(next[0].employeeId) : "";
    });
  };
  const updateParticipantShare = (id: number, sharePercent: string) =>
    setParticipants(current =>
      current.map(person =>
        person.employeeId === id ? { ...person, sharePercent } : person
      )
    );
  const submit = async (send: boolean) => {
    if (requiredDataUnavailable) {
      toast.error(
        "Os cadastros necessários não foram carregados; tente novamente antes de salvar."
      );
      return;
    }
    if (
      closureId &&
      editing.data?.status === "reaberto" &&
      changeReason.trim().length < 5
    ) {
      toast.error(
        "Informe uma justificativa com pelo menos 5 caracteres para a correção."
      );
      setStep(4);
      return;
    }
    if (!participants.length || !employeeId) {
      toast.error(
        user.role === "frentista"
          ? "Cadastre ou vincule seu funcionário antes de continuar."
          : "Selecione pelo menos um frentista."
      );
      setStep(1);
      return;
    }
    const participantPayload = toClosureParticipantPayload(participants);
    if (
      !participantPayload.length ||
      !participantPayload.some(
        person => person.employeeId === Number(employeeId)
      ) ||
      participantPayload.some(
        person =>
          !Number.isInteger(person.sharePercent) ||
          person.sharePercent < 1 ||
          person.sharePercent > 100
      ) ||
      participantPayload.reduce(
        (sum, person) => sum + person.sharePercent,
        0
      ) !== 100
    ) {
      toast.error(
        "Defina os percentuais dos frentistas selecionados, totalizando 100%."
      );
      setStep(1);
      return;
    }
    if (calculated.some(n => n.final < n.initial)) {
      toast.error("A leitura final não pode ser menor que a inicial.");
      setStep(2);
      return;
    }
    if (send && (!employeeConfirmed || !responsibleConfirmed)) {
      toast.error("Confirme as responsabilidades na etapa final.");
      setStep(4);
      return;
    }
    const payload = {
      ...(closureId
        ? {
            closureId,
            ...(editing.data?.status === "reaberto" ? { changeReason } : {}),
          }
        : {}),
      closureDate,
      shift: shift as any,
      employeeId: Number(employeeId),
      participants: participantPayload,
      responsibleName,
      notes,
      employeeConfirmed,
      responsibleConfirmed,
      nozzles: calculated.map(n => ({
        pumpId: n.id,
        initialReading: String(n.initial),
        finalReading: String(n.final),
      })),
      payments: payments.map(p => ({
        method: p.method,
        amountCents: p.amountCents,
      })),
    };
    if (!navigator.onLine) {
      const stored = saveOfflineDraft(user.id, payload);
      if (!stored)
        toast.error(
          "O navegador bloqueou o armazenamento local; o rascunho não foi guardado."
        );
      else
        toast.warning(
          send
            ? "Rascunho guardado somente nesta aba. A finalização exige conexão e ainda não foi enviada."
            : "Rascunho guardado temporariamente nesta aba; será sincronizado ao reconectar."
        );
      return;
    }
    try {
      const saved = await save.mutateAsync(payload);
      clearOfflineDraft(user.id);
      await Promise.all([
        utils.closures.list.invalidate(),
        utils.closures.listPage.invalidate(),
      ]);
      if (send) {
        const outcome = await finalize.mutateAsync({ id: saved.id });
        await Promise.all([
          utils.closures.list.invalidate(),
          utils.closures.listPage.invalidate(),
          utils.inventory.dashboard.invalidate(),
          utils.analytics.dashboard.invalidate(),
        ]);
        toast.success(
          outcome.status === "finalizado"
            ? "Fechamento finalizado e registrado."
            : "Fechamento enviado para conferência gerencial."
        );
        location.href = `/historico?fechamento=${saved.id}`;
      } else toast.success("Rascunho salvo no servidor.");
    } catch (error: any) {
      if (!navigator.onLine) {
        const stored = saveOfflineDraft(user.id, payload);
        if (stored)
          toast.warning(
            send
              ? "Sem conexão: rascunho guardado somente nesta aba. A finalização ainda não foi enviada."
              : "Sem conexão: rascunho guardado temporariamente nesta aba e será sincronizado ao reconectar."
          );
        else
          toast.error(
            "Sem conexão e sem armazenamento local disponível; o rascunho não foi guardado."
          );
        return;
      }
      toast.error(error.message ?? "Não foi possível salvar o fechamento.");
    }
  };
  const requiredDataUnavailable =
    pumps.isLoading ||
    pumps.isError ||
    staff.isLoading ||
    staff.isError ||
    participantOptions.isLoading ||
    participantOptions.isError;
  const busy = save.isPending || finalize.isPending || requiredDataUnavailable;
  if (closureId && editing.isLoading)
    return (
      <>
        <PageHeading
          eyebrow="REGISTRO OPERACIONAL"
          title="Carregando fechamento"
        />
        <div className="panel table-loading">
          Carregando dados e preços históricos…
        </div>
      </>
    );
  if (closureId && editing.isError)
    return (
      <>
        <PageHeading
          eyebrow="REGISTRO OPERACIONAL"
          title="Fechamento indisponível"
          description="A consulta falhou; o registro não foi tratado como inexistente."
        />
        <QueryError retry={() => editing.refetch()} />
      </>
    );
  if (closureId && !editing.data)
    return (
      <>
        <PageHeading
          eyebrow="REGISTRO OPERACIONAL"
          title="Fechamento indisponível"
          description="Não foi possível localizar este registro."
        />
        <div className="panel inline-alert">
          Verifique o acesso ou volte ao histórico.
        </div>
      </>
    );
  if (
    closureId &&
    editing.data &&
    (!(["reaberto", "rascunho"] as string[]).includes(editing.data.status) ||
      (user.role === "frentista" &&
        (editing.data.status !== "rascunho" ||
          editing.data.createdBy !== user.id)))
  )
    return (
      <>
        <PageHeading
          eyebrow="REGISTRO OPERACIONAL"
          title="Edição não permitida"
          description="Este fechamento não pode ser continuado por esta conta."
        />
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="ROTINA OPERACIONAL"
        title={
          closureId
            ? editing.data?.status === "rascunho"
              ? "Continuar rascunho"
              : "Editar fechamento"
            : "Novo fechamento"
        }
        description={
          closureId
            ? editing.data?.status === "rascunho"
              ? "Retome o preenchimento e finalize ou salve novamente como rascunho."
              : "Corrija o registro reaberto. O preço e a tolerância históricos são preservados."
            : "Preencha os dados do turno em quatro etapas. Os cálculos são atualizados automaticamente."
        }
      />
      {(pumps.isError || staff.isError || participantOptions.isError) && (
        <QueryError
          message="Não foi possível carregar cadastros ou bicos necessários ao fechamento."
          retry={() =>
            void Promise.all([
              pumps.refetch(),
              staff.refetch(),
              participantOptions.refetch(),
            ])
          }
        />
      )}
      <div className="wizard-progress">
        {["Identificação", "Leituras", "Recebimentos", "Revisão"].map(
          (label, index) => (
            <button
              key={label}
              type="button"
              aria-current={step === index + 1 ? "step" : undefined}
              aria-label={`${step > index + 1 ? "Etapa concluída" : step === index + 1 ? "Etapa atual" : "Etapa"}: ${label}`}
              disabled={index + 1 >= step}
              className={`wizard-step ${step === index + 1 ? "current" : step > index + 1 ? "complete" : ""}`}
              onClick={() => index + 1 < step && setStep(index + 1)}
            >
              <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
              <small>{label}</small>
            </button>
          )
        )}
      </div>
      <div
        className={`closure-layout ${step <= 2 ? "" : "closure-layout-focused"}`}
      >
        <div className="closure-main panel">
          {step === 1 && (
            <>
              <div className="form-section-heading">
                <span>01</span>
                <div>
                  <h2>Identificação do fechamento</h2>
                  <p>Defina a data, o turno e as pessoas responsáveis.</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <Label htmlFor="closure-date">Data</Label>
                  <Input
                    id="closure-date"
                    type="date"
                    value={closureDate}
                    onChange={e => setClosureDate(e.target.value)}
                    max={dateToday()}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="closure-shift">Turno</Label>
                  <select
                    id="closure-shift"
                    className="form-select"
                    value={shift}
                    onChange={e => setShift(e.target.value)}
                  >
                    <option value="manha">Manhã</option>
                    <option value="tarde">Tarde</option>
                    <option value="noite">Noite</option>
                  </select>
                </div>
                <div className="field participant-editor">
                  <Label id="closure-participants-label">
                    Frentistas participantes
                  </Label>
                  <div
                    className="participant-checkbox-list"
                    role="group"
                    aria-labelledby="closure-participants-label"
                  >
                    {(participantOptions.data ?? []).map(person => (
                      <label className="participant-checkbox" key={person.id}>
                        <input
                          type="checkbox"
                          checked={participants.some(
                            item => item.employeeId === person.id
                          )}
                          disabled={
                            user.role === "frentista" &&
                            person.id === Number(employeeId)
                          }
                          onChange={event =>
                            toggleParticipant(person.id, event.target.checked)
                          }
                        />
                        <span>{person.fullName}</span>
                      </label>
                    ))}
                  </div>
                  {participants.length === 0 && (
                    <small>
                      Selecione pelo menos um frentista para o fechamento.
                    </small>
                  )}
                  {participants.length === 1 && (
                    <small>
                      {participantOptions.data?.find(
                        item => item.id === participants[0].employeeId
                      )?.fullName ?? "O único frentista selecionado"}{" "}
                      fica com 100% automaticamente.
                    </small>
                  )}
                  {participants.length > 1 && (
                    <>
                      <small>
                        Defina o percentual de cada frentista selecionado; a
                        soma deve totalizar 100%.
                      </small>
                      <div className="participant-share-list">
                        {participants.map(person => (
                          <label
                            className="participant-share-row"
                            key={person.employeeId}
                          >
                            <span>
                              {participantOptions.data?.find(
                                item => item.id === person.employeeId
                              )?.fullName ?? "Funcionário"}
                            </span>
                            <div>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="100"
                                step="1"
                                value={person.sharePercent}
                                onChange={event =>
                                  updateParticipantShare(
                                    person.employeeId,
                                    event.target.value
                                  )
                                }
                                aria-label={`Percentual de participação de ${participantOptions.data?.find(item => item.id === person.employeeId)?.fullName ?? "funcionário"}`}
                              />
                              <small>%</small>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {user.role === "frentista" && (
                    <small>
                      Os envolvidos registrados por frentistas são uma proposta;
                      só passam a valer após revisão e confirmação do gerente,
                      sem presumir culpa.
                    </small>
                  )}
                </div>
                <div className="field">
                  <Label htmlFor="closure-responsible">
                    Responsável pelo fechamento
                  </Label>
                  <Input
                    id="closure-responsible"
                    value={responsibleName}
                    onChange={e => setResponsibleName(e.target.value)}
                    maxLength={160}
                  />
                </div>
              </div>
              {!staff.isLoading &&
                !staff.isError &&
                !staff.data?.some(e => e.active) && (
                  <div className="inline-alert">
                    <CircleAlert size={17} />
                    Nenhum funcionário ativo está vinculado. Solicite ao gerente
                    que cadastre seu vínculo.
                  </div>
                )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-section-heading">
                <span>02</span>
                <div>
                  <h2>Leitura dos bicos</h2>
                  <p>
                    Informe os totalizadores inicial e final. Litros e valores
                    são calculados com o preço vigente.
                  </p>
                </div>
              </div>
              <div
                className="nozzle-table-wrap"
                role="region"
                aria-label="Tabela de leituras dos bicos; deslize horizontalmente para ver todas as colunas"
                tabIndex={0}
              >
                <table className="data-table nozzle-table">
                  <thead>
                    <tr>
                      <th>Bico / combustível</th>
                      <th>Leitura inicial</th>
                      <th>Leitura final</th>
                      <th>Litros vendidos</th>
                      <th>Preço/L</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pumps.data ?? []).map(p => {
                      const v = readings[p.id] ?? { initial: "0", final: "0" };
                      const calc = calculated.find(n => n.id === p.id)!;
                      return (
                        <tr key={p.id}>
                          <td data-label="Bico / combustível">
                            <strong>{p.number}</strong>
                            <FuelTypeBadge fuelType={p.fuelType} />
                          </td>
                          <td data-label="Leitura inicial">
                            <Input
                              inputMode="decimal"
                              value={v.initial}
                              onChange={e =>
                                handleReading(p.id, "initial", e.target.value)
                              }
                              aria-label={`Leitura inicial ${p.number}`}
                            />
                          </td>
                          <td data-label="Leitura final">
                            <Input
                              inputMode="decimal"
                              value={v.final}
                              onChange={e =>
                                handleReading(p.id, "final", e.target.value)
                              }
                              aria-label={`Leitura final ${p.number}`}
                            />
                          </td>
                          <td data-label="Litros vendidos" className="tabular">
                            {liters(calc.liters)}
                          </td>
                          <td data-label="Preço por litro" className="tabular">
                            {brl(p.priceCents)}
                          </td>
                          <td
                            data-label="Valor vendido"
                            className="tabular strong"
                          >
                            {brl(calc.valueCents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>TOTAL GERAL</td>
                      <td>
                        {liters(calculated.reduce((s, n) => s + n.liters, 0))}
                      </td>
                      <td>—</td>
                      <td>{brl(salesCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {(pumps.data ?? []).some(p => p.priceCents === 0) && (
                <div className="inline-alert warning-alert">
                  <CircleAlert size={17} />
                  Há preço zerado ou ainda não configurado. O administrador deve
                  cadastrar o preço vigente antes da finalização.
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="form-section-heading">
                <span>03</span>
                <div>
                  <h2>Recebimentos</h2>
                  <p>Informe o total recebido em cada modalidade.</p>
                </div>
              </div>
              <div className="payment-input-grid">
                {(
                  [
                    ["dinheiro", "Dinheiro", "R$"],
                    ["pix", "PIX", "◇"],
                    ["debito", "Débito", "▤"],
                    ["credito", "Crédito", "▣"],
                  ] as const
                ).map(([key, label, icon]) => (
                  <div className="payment-input-card" key={key}>
                    <span className={`payment-method-icon ${key}`}>{icon}</span>
                    <div className="field">
                      <Label htmlFor={`pay-${key}`}>{label}</Label>
                      <div className="currency-input">
                        <span>R$</span>
                        <Input
                          id={`pay-${key}`}
                          inputMode="decimal"
                          value={paymentValues[key]}
                          onChange={e =>
                            setPaymentValues(old => ({
                              ...old,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="receipt-total">
                <span>Total recebido</span>
                <strong>{brl(receivedCents)}</strong>
              </div>
              <div
                className={`difference-callout ${Math.abs(difference) <= 0 ? "balanced" : difference > 0 ? "surplus" : "shortage"}`}
              >
                <div>
                  <span>Diferença em relação às vendas</span>
                  <strong>
                    {difference > 0 ? "+" : ""}
                    {brl(difference)}
                  </strong>
                </div>
                <span className="result-pill">
                  {resultLabel(
                    Math.abs(difference) <= 0
                      ? "conferido"
                      : difference > 0
                        ? "sobra"
                        : "falta"
                  )}
                </span>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="form-section-heading">
                <span>04</span>
                <div>
                  <h2>Observações e revisão</h2>
                  <p>
                    Registre ocorrências e confirme as responsabilidades antes
                    de enviar.
                  </p>
                </div>
              </div>
              {closureId && editing.data?.status === "reaberto" && (
                <div className="field">
                  <Label htmlFor="closure-change-reason">
                    Justificativa obrigatória da correção
                  </Label>
                  <textarea
                    id="closure-change-reason"
                    className="form-textarea"
                    value={changeReason}
                    onChange={e => setChangeReason(e.target.value)}
                    maxLength={1000}
                    minLength={5}
                    required
                    rows={2}
                    placeholder="Explique por que o fechamento está sendo corrigido…"
                  />
                </div>
              )}
              <div className="field">
                <Label htmlFor="closure-notes">
                  Observações, ocorrências e justificativas
                </Label>
                <textarea
                  id="closure-notes"
                  className="form-textarea"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  maxLength={4000}
                  rows={4}
                  placeholder="Registre informações relevantes sobre o turno…"
                />
                <small>{notes.length}/4000 caracteres</small>
              </div>
              <div className="review-card">
                <div className="review-row">
                  <span>Data e turno</span>
                  <strong>
                    {dateLabel(closureDate)} · {shiftLabel(shift)}
                  </strong>
                </div>
                <div className="review-row">
                  <span>
                    {participants.length > 1
                      ? "Frentistas e rateio"
                      : "Frentista selecionado"}
                  </span>
                  <strong>
                    {participants
                      .map(
                        person =>
                          `${participantOptions.data?.find(e => e.id === person.employeeId)?.fullName ?? "Funcionário"}: ${participants.length === 1 ? "100" : person.sharePercent || "—"}%`
                      )
                      .join(" · ") || "—"}
                  </strong>
                </div>
                <div className="review-row">
                  <span>Responsável pelo fechamento</span>
                  <strong>{responsibleName || "—"}</strong>
                </div>
                <div className="review-divider" />
                <div className="review-row">
                  <span>Total de vendas</span>
                  <strong>{brl(salesCents)}</strong>
                </div>
                <div className="review-row">
                  <span>Total recebido</span>
                  <strong>{brl(receivedCents)}</strong>
                </div>
                <div className="review-row">
                  <span>Diferença</span>
                  <strong
                    className={
                      difference > 0
                        ? "text-warning"
                        : difference < 0
                          ? "text-danger"
                          : "text-success"
                    }
                  >
                    {difference > 0 ? "+" : ""}
                    {brl(difference)} ·{" "}
                    {resultLabel(
                      difference === 0
                        ? "conferido"
                        : difference > 0
                          ? "sobra"
                          : "falta"
                    )}
                  </strong>
                </div>
              </div>
              <label className="confirm-check">
                <input
                  type="checkbox"
                  checked={employeeConfirmed}
                  onChange={e => setEmployeeConfirmed(e.target.checked)}
                />
                <span>
                  <strong>Confirmo como frentista responsável</strong>
                  <small>
                    Declaro que as leituras e informações do turno foram
                    registradas por mim.
                  </small>
                </span>
              </label>
              <label className="confirm-check">
                <input
                  type="checkbox"
                  checked={responsibleConfirmed}
                  onChange={e => setResponsibleConfirmed(e.target.checked)}
                />
                <span>
                  <strong>Confirmo como responsável pelo fechamento</strong>
                  <small>
                    Declaro que revisei os dados e os recebimentos informados.
                  </small>
                </span>
              </label>
            </>
          )}
          <div className="wizard-footer">
            <Button
              variant="outline"
              disabled={step === 1}
              onClick={() => setStep(s => Math.max(1, s - 1))}
            >
              <ArrowLeft size={16} /> Voltar
            </Button>
            <div className="wizard-actions">
              <Button
                variant="outline"
                disabled={
                  busy ||
                  (editing.data?.status === "reaberto" &&
                    changeReason.trim().length < 5)
                }
                onClick={() => submit(false)}
              >
                Salvar rascunho
              </Button>
              {step < 4 ? (
                <Button
                  className="primary-button"
                  onClick={() => setStep(s => Math.min(4, s + 1))}
                >
                  Continuar para{" "}
                  {(["Leituras", "Recebimentos", "Revisão"] as const)[step - 1]}{" "}
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button
                  className="primary-button"
                  disabled={
                    busy ||
                    !employeeConfirmed ||
                    !responsibleConfirmed ||
                    !employeeId ||
                    (editing.data?.status === "reaberto" &&
                      changeReason.trim().length < 5)
                  }
                  onClick={() => submit(true)}
                >
                  <CheckCircle2 size={16} />
                  {busy ? "Salvando…" : "Finalizar fechamento"}
                </Button>
              )}
            </div>
          </div>
        </div>
        {step <= 2 && (
          <aside className="closure-summary">
            <div className="panel summary-card">
              <span className="eyebrow">RESUMO EM TEMPO REAL</span>
              <h3>{dateLabel(closureDate)}</h3>
              <div className="summary-shift">
                <Clock3 size={15} />
                {shiftLabel(shift)}
              </div>
              <div className="summary-separator" />
              <div className="summary-value">
                <span>Vendas calculadas</span>
                <strong>{brl(salesCents)}</strong>
              </div>
              <div className="summary-value">
                <span>Total recebido</span>
                <strong>{brl(receivedCents)}</strong>
              </div>
              <div className="summary-value">
                <span>Diferença</span>
                <strong
                  className={
                    difference === 0
                      ? "text-success"
                      : difference > 0
                        ? "text-warning"
                        : "text-danger"
                  }
                >
                  {difference > 0 ? "+" : ""}
                  {brl(difference)}
                </strong>
              </div>
              <div
                className={`summary-result ${difference === 0 ? "success" : difference > 0 ? "warning" : "danger"}`}
              >
                <span />
                {resultLabel(
                  difference === 0
                    ? "conferido"
                    : difference > 0
                      ? "sobra"
                      : "falta"
                )}
              </div>
              <small className="summary-footnote">
                Rascunhos só são considerados gravados após confirmação do
                servidor.
              </small>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

function ClosureTable({
  rows,
  loading,
  compact = false,
  error = false,
  retry,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  rows: any[];
  loading: boolean;
  compact?: boolean;
  error?: boolean;
  retry?: () => unknown;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const filtered = rows.filter(row => {
    const matchesSearch =
      `${row.employeeName ?? ""} ${row.responsibleName ?? ""} ${row.closureDate ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesResult =
      resultFilter === "all" ||
      (resultFilter === "aguardando_conferencia" &&
        (row.status === "aguardando_conferencia" ||
          row.result === "pendente")) ||
      (resultFilter === "rascunho" && row.status === "rascunho") ||
      (resultFilter === "reaberto" && row.status === "reaberto") ||
      row.result === resultFilter;
    return matchesSearch && matchesResult;
  });
  return (
    <div className="panel table-panel">
      {!compact && (
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <Input
              aria-label="Buscar fechamentos por data, frentista ou responsável"
              placeholder="Buscar por data, frentista ou responsável"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-control"
            aria-label="Filtrar situação"
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value)}
          >
            <option value="all">Todas as situações</option>
            <option value="conferido">Conferido</option>
            <option value="sobra">Sobra</option>
            <option value="falta">Falta</option>
            <option value="aguardando_conferencia">
              Aguardando conferência
            </option>
            <option value="rascunho">Em preenchimento</option>
            <option value="reaberto">Reaberto</option>
          </select>
        </div>
      )}
      {error ? (
        <QueryError retry={retry} />
      ) : loading ? (
        <div className="table-loading">Carregando fechamentos…</div>
      ) : filtered.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Tabela de fechamentos; deslize horizontalmente para ver todas as colunas"
          tabIndex={0}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Turno</th>
                <th>Frentista</th>
                <th>Total de vendas</th>
                <th>Recebido</th>
                <th>Diferença</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id}>
                  <td>{dateLabel(row.closureDate)}</td>
                  <td>{shiftLabel(row.shift)}</td>
                  <td>{row.employeeName}</td>
                  <td className="tabular strong">{brl(row.salesCents)}</td>
                  <td className="tabular">{brl(row.receivedCents)}</td>
                  <td
                    className={`tabular ${row.differenceCents > 0 ? "text-warning" : row.differenceCents < 0 ? "text-danger" : ""}`}
                  >
                    {row.differenceCents > 0 ? "+" : ""}
                    {brl(row.differenceCents)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${row.deletedAt ? "neutral" : row.status === "finalizado" ? (row.result === "conferido" ? "success" : "danger") : row.status === "aguardando_conferencia" ? "warning" : "neutral"}`}
                    >
                      {row.deletedAt
                        ? "Arquivado"
                        : row.status === "aguardando_conferencia"
                          ? "Aguardando"
                          : resultLabel(row.result)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() =>
                        (window.location.href = `/historico?fechamento=${row.id}`)
                      }
                    >
                      Detalhes <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyPanel
          icon={History}
          title="Nenhum fechamento encontrado"
          detail="Ajuste a busca ou inicie um novo fechamento para preencher o histórico."
        />
      )}
      {hasMore && onLoadMore && (
        <div className="table-load-more">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Carregando…" : "Carregar mais registros"}
          </Button>
        </div>
      )}
    </div>
  );
}

type ConfirmedParticipant = { employeeId: number; sharePercent: number };
type ParticipantOption = { id: number; fullName: string };

function HistoryPage({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<number | null>(
    new URLSearchParams(location.search).get("fechamento")
      ? Number(new URLSearchParams(location.search).get("fechamento"))
      : null
  );
  const [showArchived, setShowArchived] = useState(false);
  const query = trpc.closures.listPage.useInfiniteQuery(
    {
      from: from || undefined,
      to: to || undefined,
      includeArchived: user.role === "administrador" && showArchived,
      limit: 50,
    },
    {
      getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
      retry: false,
    }
  );
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const detail = trpc.closures.detail.useQuery(
    { id: selected ?? 0 },
    { enabled: Boolean(selected) }
  );
  const participantOptions = trpc.employees.participantOptions.useQuery(
    undefined,
    { enabled: user.role !== "frentista" }
  );
  const confirm = trpc.closures.confirm.useMutation({
    onSuccess: async () => {
      await Promise.all([
        query.refetch(),
        detail.refetch(),
        utils.inventory.dashboard.invalidate(),
        utils.analytics.dashboard.invalidate(),
      ]);
      toast.success("Fechamento conferido após revisão explícita do rateio.");
    },
    onError: error => toast.error(error.message),
  });
  const reopen = trpc.closures.reopen.useMutation({
    onSuccess: async () => {
      await Promise.all([
        query.refetch(),
        detail.refetch(),
        utils.inventory.dashboard.invalidate(),
        utils.analytics.dashboard.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const archive = trpc.closures.archiveDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        query.refetch(),
        utils.closures.list.invalidate(),
        utils.analytics.dashboard.invalidate(),
      ]);
      setSelected(null);
      toast.success("Rascunho arquivado. Os dados foram preservados.");
    },
    onError: error => toast.error(error.message),
  });
  const restore = trpc.closures.restoreDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([query.refetch(), utils.closures.list.invalidate()]);
      setSelected(null);
      toast.success("Rascunho restaurado ao histórico ativo.");
    },
    onError: error => toast.error(error.message),
  });
  const confirmClosure = (participants: ConfirmedParticipant[]) => {
    if (selected) confirm.mutate({ id: selected, participants });
  };
  return (
    <>
      <PageHeading
        eyebrow="REGISTROS OPERACIONAIS"
        title="Histórico de fechamentos"
        description="Consulte turnos, diferenças e responsáveis registrados."
        action={
          <Link href="/fechamento/novo" className="quick-primary">
            <Plus size={16} /> Novo fechamento
          </Link>
        }
      />
      <div className="filter-strip">
        <div className="field">
          <Label htmlFor="history-from">De</Label>
          <Input
            id="history-from"
            type="date"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="history-to">Até</Label>
          <Input
            id="history-to"
            type="date"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
        </div>
        {user.role === "administrador" && (
          <label className="archive-filter">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
            />
            <span>Mostrar rascunhos arquivados</span>
          </label>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </Button>
        <span className="filter-count" aria-live="polite">
          {query.isError ? "—" : rows.length} registros
          {showArchived ? " arquivados" : " ativos"}
        </span>
      </div>
      <ClosureTable
        rows={rows}
        loading={query.isLoading}
        error={query.isError}
        retry={() => query.refetch()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
      {selected && (
        <DetailModal
          closure={detail.data}
          loading={detail.isLoading}
          error={detail.isError}
          retry={() => detail.refetch()}
          onClose={() => setSelected(null)}
          onConfirm={user.role !== "frentista" ? confirmClosure : undefined}
          confirmBusy={confirm.isPending}
          participantOptions={participantOptions.data ?? []}
          onReopen={
            user.role === "administrador"
              ? () => {
                  const reason = window.prompt(
                    "Justificativa obrigatória para reabertura:"
                  );
                  if (reason) reopen.mutate({ id: selected, reason });
                }
              : undefined
          }
          onEdit={
            user.role !== "frentista" && detail.data?.status === "reaberto"
              ? () => setLocation(`/fechamento/editar/${selected}`)
              : undefined
          }
          onResumeDraft={
            detail.data?.status === "rascunho" &&
            !detail.data?.deletedAt &&
            (user.role !== "frentista" || detail.data.createdBy === user.id)
              ? () => setLocation(`/fechamento/editar/${selected}`)
              : undefined
          }
          onArchive={
            user.role === "administrador"
              ? (reason, confirmation) =>
                  archive.mutate({ id: selected, reason, confirmation })
              : undefined
          }
          archiveBusy={archive.isPending}
          onRestore={
            user.role === "administrador"
              ? reason => restore.mutate({ id: selected, reason })
              : undefined
          }
          restoreBusy={restore.isPending}
        />
      )}
    </>
  );
}

function DetailModal({
  closure,
  loading,
  error = false,
  retry,
  onClose,
  onConfirm,
  confirmBusy = false,
  participantOptions = [],
  onReopen,
  onEdit,
  onResumeDraft,
  onArchive,
  archiveBusy = false,
  onRestore,
  restoreBusy = false,
}: {
  closure: any;
  loading: boolean;
  error?: boolean;
  retry?: () => unknown;
  onClose: () => void;
  onConfirm?: (participants: ConfirmedParticipant[]) => void;
  confirmBusy?: boolean;
  participantOptions?: ParticipantOption[];
  onReopen?: () => void;
  onEdit?: () => void;
  onResumeDraft?: () => void;
  onArchive?: (reason: string, confirmation: "EXCLUIR") => void;
  archiveBusy?: boolean;
  onRestore?: (reason: string) => void;
  restoreBusy?: boolean;
}) {
  const [shareBusy, setShareBusy] = useState(false);
  const [archiveAction, setArchiveAction] = useState<
    "archive" | "restore" | null
  >(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [participants, setParticipants] = useState<
    Array<{ employeeId: number; sharePercent: string }>
  >([]);
  const [newParticipantId, setNewParticipantId] = useState("");
  const [rateioReviewed, setRateioReviewed] = useState(false);
  useEffect(() => {
    if (!closure) return;
    setParticipants(
      (closure.participants ?? []).map((person: any) => ({
        employeeId: person.employeeId,
        sharePercent: String(person.sharePercent),
      }))
    );
    setNewParticipantId("");
    setRateioReviewed(false);
  }, [closure?.id, closure?.participants]);
  const allocationTotal = participants.reduce(
    (sum, person) => sum + (Number(person.sharePercent) || 0),
    0
  );
  const allocationValid = Boolean(
    closure &&
      participants.length > 0 &&
      participants.some(person => person.employeeId === closure.employeeId) &&
      participants.every(
        person =>
          Number.isInteger(Number(person.sharePercent)) &&
          Number(person.sharePercent) >= 1 &&
          Number(person.sharePercent) <= 100
      ) &&
      allocationTotal === 100
  );
  const addParticipant = () => {
    const employeeId = Number(newParticipantId);
    if (
      !employeeId ||
      participants.some(person => person.employeeId === employeeId)
    )
      return;
    setParticipants(current => [...current, { employeeId, sharePercent: "" }]);
    setNewParticipantId("");
    setRateioReviewed(false);
  };
  const actShare = async () => {
    if (!closure) return;
    setShareBusy(true);
    try {
      const result = await shareClosurePdf(closure);
      toast.success(
        result === "shared"
          ? "Compartilhamento aberto. Confirme o envio no aplicativo escolhido."
          : "PDF baixado; o WhatsApp foi aberto com a mensagem pronta. Anexe o arquivo baixado."
      );
    } catch (error: any) {
      if (error?.name !== "AbortError")
        toast.error("Não foi possível gerar ou compartilhar o PDF.");
    } finally {
      setShareBusy(false);
    }
  };
  const confirmAllocation = () => {
    if (!onConfirm) return;
    if (!rateioReviewed) {
      toast.error(
        "Marque a confirmação após revisar os envolvidos e o rateio."
      );
      return;
    }
    if (!allocationValid) {
      toast.error(
        "O rateio confirmado deve incluir o frentista principal e totalizar 100%."
      );
      return;
    }
    onConfirm(
      participants.map(person => ({
        employeeId: person.employeeId,
        sharePercent: Number(person.sharePercent),
      }))
    );
  };
  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="detail-modal"
          onClick={event => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <span className="eyebrow">DETALHES DO TURNO</span>
              <h2>Fechamento</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Fechar detalhes do fechamento"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
          {loading ? (
            <p>Carregando detalhes…</p>
          ) : error ? (
            <QueryError retry={retry} />
          ) : (
            closure && (
              <>
                <div className="detail-top">
                  <strong>
                    {dateLabel(closure.closureDate)} ·{" "}
                    {shiftLabel(closure.shift)}
                  </strong>
                  <span
                    className={`status-badge ${closure.result === "conferido" ? "success" : closure.result === "pendente" ? "warning" : "danger"}`}
                  >
                    {resultLabel(closure.result)}
                  </span>
                </div>
                <div className="detail-meta">
                  <span>
                    Frentista<strong>{closure.employeeName}</strong>
                  </span>
                  <span>
                    Responsável<strong>{closure.responsibleName}</strong>
                  </span>
                  <span>
                    Status
                    <strong>
                      {closure.deletedAt
                        ? "Arquivado"
                        : statusLabel(closure.status)}
                    </strong>
                  </span>
                </div>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Tabela de detalhes do fechamento; deslize horizontalmente para ver todas as colunas"
                  tabIndex={0}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Bico</th>
                        <th>Combustível</th>
                        <th>Inicial</th>
                        <th>Final</th>
                        <th>Litros</th>
                        <th>Preço</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closure.nozzles?.map((nozzle: any) => (
                        <tr key={nozzle.id}>
                          <td>{nozzle.pumpNumber}</td>
                          <td>
                            <FuelTypeBadge fuelType={nozzle.fuelType} />
                          </td>
                          <td>{nozzle.initialReading}</td>
                          <td>{nozzle.finalReading}</td>
                          <td>{liters(Number(nozzle.liters))}</td>
                          <td>{brl(nozzle.priceCents)}</td>
                          <td>{brl(nozzle.valueCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="detail-payments">
                  <strong>Recebimentos</strong>
                  {closure.payments?.map((payment: any) => (
                    <div key={payment.id}>
                      <span>
                        {
                          (
                            {
                              dinheiro: "Dinheiro",
                              pix: "PIX",
                              debito: "Débito",
                              credito: "Crédito",
                            } as any
                          )[payment.method]
                        }
                      </span>
                      <b>{brl(payment.amountCents)}</b>
                    </div>
                  ))}
                </div>
                <div className="detail-totals">
                  <div>
                    <span>Vendas</span>
                    <b>{brl(closure.salesCents)}</b>
                  </div>
                  <div>
                    <span>Recebido</span>
                    <b>{brl(closure.receivedCents)}</b>
                  </div>
                  <div>
                    <span>Diferença</span>
                    <b>{brl(closure.differenceCents)}</b>
                  </div>
                </div>
                {closure.participants?.length > 0 && (
                  <div className="notes-box">
                    <strong>Participantes informados</strong>
                    <p>
                      {closure.participants
                        .map(
                          (person: any) =>
                            `${person.employeeName}: ${person.sharePercent}%`
                        )
                        .join(" · ")}
                    </p>
                  </div>
                )}
                {closure.notes && (
                  <div className="notes-box">
                    <strong>Observações</strong>
                    <p>{closure.notes}</p>
                  </div>
                )}
                {onConfirm && closure.status === "aguardando_conferencia" && (
                  <section className="allocation-review-box">
                    <div>
                      <strong>
                        Revisão gerencial dos envolvidos e do rateio
                      </strong>
                      <p>
                        A proposta registrada no fechamento não é imputação
                        aprovada. Revise e confirme os percentuais nesta etapa
                        antes de finalizar.
                      </p>
                    </div>
                    <div className="allocation-review-add">
                      <select
                        className="form-select"
                        aria-label="Adicionar funcionário ao rateio"
                        value={newParticipantId}
                        onChange={event =>
                          setNewParticipantId(event.target.value)
                        }
                      >
                        <option value="">Adicionar funcionário</option>
                        {participantOptions
                          .filter(
                            person =>
                              !participants.some(
                                item => item.employeeId === person.id
                              )
                          )
                          .map(person => (
                            <option key={person.id} value={person.id}>
                              {person.fullName}
                            </option>
                          ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!newParticipantId}
                        onClick={addParticipant}
                      >
                        Adicionar
                      </Button>
                    </div>
                    <div className="allocation-share-list">
                      {participants.map(person => (
                        <div
                          className="allocation-share-row"
                          key={person.employeeId}
                        >
                          <span>
                            {participantOptions.find(
                              item => item.id === person.employeeId
                            )?.fullName ??
                              closure.participants?.find(
                                (item: any) =>
                                  item.employeeId === person.employeeId
                              )?.employeeName ??
                              "Funcionário"}
                            {person.employeeId === closure.employeeId
                              ? " · principal"
                              : ""}
                          </span>
                          <div>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max="100"
                              step="1"
                              value={person.sharePercent}
                              aria-label={`Percentual de ${participantOptions.find(item => item.id === person.employeeId)?.fullName ?? "funcionário"}`}
                              onChange={event => {
                                setParticipants(current =>
                                  current.map(item =>
                                    item.employeeId === person.employeeId
                                      ? {
                                          ...item,
                                          sharePercent: event.target.value,
                                        }
                                      : item
                                  )
                                );
                                setRateioReviewed(false);
                              }}
                            />{" "}
                            <small>%</small>
                            {person.employeeId !== closure.employeeId && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setParticipants(current =>
                                    current.filter(
                                      item =>
                                        item.employeeId !== person.employeeId
                                    )
                                  );
                                  setRateioReviewed(false);
                                }}
                              >
                                Remover
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="allocation-review-total">
                      Total do rateio:{" "}
                      <strong
                        className={
                          allocationTotal === 100
                            ? "text-success"
                            : "text-danger"
                        }
                      >
                        {allocationTotal}%
                      </strong>
                    </div>
                    <label className="allocation-reviewed">
                      <input
                        type="checkbox"
                        checked={rateioReviewed}
                        onChange={event =>
                          setRateioReviewed(event.target.checked)
                        }
                      />
                      <span>
                        Revisei os funcionários envolvidos e confirmo
                        explicitamente este rateio para a análise da
                        divergência.
                      </span>
                    </label>
                  </section>
                )}
                <div className="modal-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!openClosurePrintWindow(closure as ClosurePrintInput))
                        toast.error(
                          "Permita a abertura da janela para imprimir o fechamento."
                        );
                    }}
                  >
                    <Printer size={16} /> Imprimir
                  </Button>
                  <Button
                    variant="outline"
                    disabled={shareBusy}
                    onClick={actShare}
                  >
                    <Download size={16} />{" "}
                    {shareBusy ? "Preparando…" : "Gerar PDF / WhatsApp"}
                  </Button>
                  {onConfirm && closure.status === "aguardando_conferencia" && (
                    <Button
                      className="primary-button"
                      disabled={confirmBusy}
                      onClick={confirmAllocation}
                    >
                      <BadgeCheck size={16} />
                      {confirmBusy
                        ? "Conferindo…"
                        : "Confirmar rateio e conferir"}
                    </Button>
                  )}
                  {onReopen && closure.status === "finalizado" && (
                    <Button variant="outline" onClick={onReopen}>
                      Reabrir
                    </Button>
                  )}
                  {onEdit && closure.status === "reaberto" && (
                    <Button className="primary-button" onClick={onEdit}>
                      Editar correção
                    </Button>
                  )}
                  {onResumeDraft && closure.status === "rascunho" && (
                    <Button className="primary-button" onClick={onResumeDraft}>
                      Continuar rascunho
                    </Button>
                  )}
                  {onArchive &&
                    closure.status === "rascunho" &&
                    !closure.deletedAt &&
                    !closure.finalizedAt &&
                    !closure.reopenedAt && (
                      <Button
                        variant="outline"
                        disabled={archiveBusy}
                        onClick={() => {
                          setArchiveReason("");
                          setArchiveConfirmation("");
                          setArchiveAction("archive");
                        }}
                      >
                        Arquivar rascunho
                      </Button>
                    )}
                  {onRestore && closure.deletedAt && (
                    <Button
                      variant="outline"
                      disabled={restoreBusy}
                      onClick={() => {
                        setArchiveReason("");
                        setArchiveConfirmation("");
                        setArchiveAction("restore");
                      }}
                    >
                      Restaurar rascunho
                    </Button>
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
      <AlertDialog
        open={archiveAction !== null}
        onOpenChange={open => {
          if (!open && !archiveBusy && !restoreBusy) setArchiveAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveAction === "archive"
                ? "Arquivar rascunho?"
                : "Restaurar rascunho?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveAction === "archive"
                ? "O registro e seus detalhes serão preservados e poderão ser restaurados por um administrador. Fechamentos finalizados, reabertos ou vinculados não são elegíveis."
                : "O rascunho voltará ao histórico ativo. A restauração será recusada se já existir outro fechamento ativo para a mesma data e turno."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="field">
            <Label htmlFor="closure-archive-reason">Motivo obrigatório</Label>
            <Input
              id="closure-archive-reason"
              autoComplete="off"
              required
              value={archiveReason}
              onChange={event => setArchiveReason(event.target.value)}
              aria-describedby="closure-archive-reason-help"
              disabled={archiveBusy || restoreBusy}
            />
            <small id="closure-archive-reason-help">
              Informe ao menos 5 caracteres para registrar a justificativa na
              auditoria.
            </small>
          </div>
          {archiveAction === "archive" && (
            <div className="field">
              <Label htmlFor="closure-archive-confirmation">
                Digite EXCLUIR para confirmar
              </Label>
              <Input
                id="closure-archive-confirmation"
                autoComplete="off"
                required
                value={archiveConfirmation}
                onChange={event => setArchiveConfirmation(event.target.value)}
                disabled={archiveBusy}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={archiveBusy || restoreBusy}
              onClick={() => setArchiveAction(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              className="primary-button"
              disabled={
                archiveBusy ||
                restoreBusy ||
                archiveReason.trim().length < 5 ||
                (archiveAction === "archive" &&
                  archiveConfirmation !== "EXCLUIR")
              }
              onClick={() => {
                const reason = archiveReason.trim();
                if (reason.length < 5) {
                  toast.error("Informe um motivo com pelo menos 5 caracteres.");
                  return;
                }
                if (archiveAction === "archive") {
                  if (archiveConfirmation !== "EXCLUIR") {
                    toast.error('Digite exatamente "EXCLUIR" para confirmar.');
                    return;
                  }
                  onArchive?.(reason, "EXCLUIR");
                } else if (archiveAction === "restore") {
                  onRestore?.(reason);
                }
              }}
            >
              {archiveBusy || restoreBusy
                ? "Processando…"
                : archiveAction === "archive"
                  ? "Arquivar rascunho"
                  : "Restaurar rascunho"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = trpc.analytics.report.useQuery({
    from: from || undefined,
    to: to || undefined,
  });
  const completed =
    query.data?.filter(row => row.status === "finalizado") ?? [];
  const ready = !query.isLoading && !query.isError;
  const sales = completed.reduce((sum, row) => sum + row.salesCents, 0);
  const receipts = completed.reduce((sum, row) => sum + row.receivedCents, 0);
  const discrepancies = completed.filter(
    row => row.result === "sobra" || row.result === "falta"
  );

  return (
    <>
      <PageHeading
        eyebrow="ANÁLISE GERENCIAL"
        title="Relatórios"
        description="Dados reais dos fechamentos finalizados, filtrados pelo período selecionado."
        action={
          <div className="heading-actions">
            <Button
              variant="outline"
              disabled={!ready}
              onClick={() =>
                exportReportXlsx(completed).catch(() =>
                  toast.error("Falha ao criar Excel.")
                )
              }
            >
              <Download size={16} /> Exportar Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </Button>
          </div>
        }
      />
      <div className="filter-strip">
        <div className="field">
          <Label htmlFor="report-from">De</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="report-to">Até</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
        </div>
        <span className="filter-count">
          {query.isLoading
            ? "Carregando…"
            : query.isError
              ? "—"
              : `${completed.length} fechamentos finalizados`}
        </span>
        <p className="active-filter-summary" role="status" aria-live="polite">
          Período aplicado:{" "}
          {from && to
            ? `de ${dateLabel(from)} a ${dateLabel(to)}`
            : from
              ? `a partir de ${dateLabel(from)}`
              : to
                ? `até ${dateLabel(to)}`
                : "todos os períodos"}
        </p>
      </div>
      {query.isError && (
        <QueryError
          message="O relatório não foi carregado; os totais não representam ausência de registros."
          retry={() => query.refetch()}
        />
      )}
      <div className="stats-grid report-stats">
        <StatCard
          label="Faturamento"
          value={ready ? brl(sales) : "—"}
          icon={Banknote}
        />
        <StatCard
          label="Recebimentos"
          value={ready ? brl(receipts) : "—"}
          icon={Wallet}
          tone="green"
        />
        <StatCard
          label="Diferença líquida"
          value={ready ? brl(receipts - sales) : "—"}
          icon={Activity}
          tone={receipts >= sales ? "yellow" : "red"}
        />
        <StatCard
          label="Fechamentos"
          value={ready ? String(completed.length) : "—"}
          icon={FileCheck2}
          tone="blue"
        />
      </div>
      <div className="panel report-summary">
        <SectionTitle
          title="Resumo por turno"
          subtitle="Fechamentos finalizados"
        />
        {!ready ? (
          <div className="query-data-state" role="status">
            {query.isLoading
              ? "Carregando dados do relatório…"
              : "Resumo indisponível por falha na consulta."}
          </div>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Resumo por turno; deslize horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Fechamentos</th>
                  <th>Vendas</th>
                  <th>Recebido</th>
                  <th>Sobra</th>
                  <th>Falta</th>
                </tr>
              </thead>
              <tbody>
                {["manha", "tarde", "noite"].map(shift => {
                  const group = completed.filter(row => row.shift === shift);
                  return (
                    <tr key={shift}>
                      <td>{shiftLabel(shift)}</td>
                      <td>{group.length}</td>
                      <td>
                        {brl(
                          group.reduce((sum, row) => sum + row.salesCents, 0)
                        )}
                      </td>
                      <td>
                        {brl(
                          group.reduce((sum, row) => sum + row.receivedCents, 0)
                        )}
                      </td>
                      <td>
                        {brl(
                          group
                            .filter(row => row.result === "sobra")
                            .reduce((sum, row) => sum + row.differenceCents, 0)
                        )}
                      </td>
                      <td>
                        {brl(
                          Math.abs(
                            group
                              .filter(row => row.result === "falta")
                              .reduce(
                                (sum, row) => sum + row.differenceCents,
                                0
                              )
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="section-block">
        <SectionTitle
          title="Divergências do período"
          subtitle="Registro objetivo, sem presumir responsabilidade"
        />
        <ClosureTable
          rows={ready ? discrepancies : []}
          loading={query.isLoading}
          error={query.isError}
          retry={() => query.refetch()}
          compact
        />
      </div>
    </>
  );
}

function EmployeesPage() {
  const query = trpc.employees.list.useQuery();
  const [name, setName] = useState("");
  const create = trpc.employees.create.useMutation({
    onSuccess: () => {
      setName("");
      query.refetch();
      toast.success("Funcionário cadastrado.");
    },
    onError: error => toast.error(error.message),
  });
  const toggle = trpc.employees.setActive.useMutation({
    onSuccess: () => query.refetch(),
  });
  const countLabel = query.isLoading
    ? "Carregando…"
    : query.isError
      ? "Dados indisponíveis"
      : `${query.data?.length ?? 0} funcionários`;
  return (
    <>
      <PageHeading
        eyebrow="EQUIPE"
        title="Funcionários"
        description="Cadastre e mantenha o vínculo dos frentistas com os turnos."
      />
      <div className="panel inline-create">
        <div className="inline-create-copy">
          <span className="eyebrow">NOVO CADASTRO</span>
          <strong>Adicionar funcionário</strong>
          <small>Vincule usuários pelo menu Usuários e permissões.</small>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (name.trim()) create.mutate({ fullName: name });
          }}
        >
          <div className="field inline-create-field">
            <Label htmlFor="employee-name">Nome completo</Label>
            <Input
              id="employee-name"
              placeholder="Nome completo"
              value={name}
              onChange={event => setName(event.target.value)}
              required
              minLength={2}
            />
          </div>
          <Button className="primary-button" disabled={create.isPending}>
            <Plus size={16} /> Cadastrar
          </Button>
        </form>
      </div>
      <div className="panel table-panel">
        <SectionTitle title="Equipe cadastrada" subtitle={countLabel} />
        {query.isLoading ? (
          <div className="table-loading">Carregando funcionários…</div>
        ) : query.isError ? (
          <QueryError retry={() => query.refetch()} />
        ) : query.data?.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Tabela de funcionários; deslize horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome completo</th>
                  <th>Status</th>
                  <th>Data de cadastro</th>
                  <th>Conta vinculada</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.map(employee => (
                  <tr key={employee.id}>
                    <td className="strong">{employee.fullName}</td>
                    <td>
                      <span
                        className={`status-badge ${employee.active ? "success" : "neutral"}`}
                      >
                        {employee.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      {new Date(employee.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td>{employee.linkedUserId ? "Sim" : "Não"}</td>
                    <td>
                      <button
                        className="table-action"
                        onClick={() =>
                          toggle.mutate({
                            id: employee.id,
                            active: !employee.active,
                          })
                        }
                      >
                        {employee.active ? "Desativar" : "Reativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel
            icon={Users}
            title="Nenhum funcionário cadastrado"
            detail="Adicione os funcionários para habilitar sua seleção nos fechamentos."
          />
        )}
      </div>
    </>
  );
}

function UsersPage() {
  const query = trpc.users.list.useQuery();
  const staff = trpc.employees.list.useQuery();
  const [form, setForm] = useState({
    username: "",
    fullName: "",
    password: "",
    role: "frentista" as User["role"],
    employeeId: "",
  });
  const create = trpc.users.create.useMutation({
    onSuccess: () => {
      query.refetch();
      setForm({
        username: "",
        fullName: "",
        password: "",
        role: "frentista",
        employeeId: "",
      });
      toast.success("Usuário criado.");
    },
    onError: error => toast.error(error.message),
  });
  const toggle = trpc.users.setActive.useMutation({
    onSuccess: () => query.refetch(),
  });
  const dataReady =
    !query.isLoading && !staff.isLoading && !query.isError && !staff.isError;
  const retry = () => Promise.all([query.refetch(), staff.refetch()]);
  return (
    <>
      <PageHeading
        eyebrow="CONTROLE DE ACESSO"
        title="Usuários e permissões"
        description="Contas individuais e níveis de acesso. Senhas não são exibidas nem recuperadas."
      />
      {(query.isError || staff.isError) && (
        <QueryError
          message="Não foi possível carregar as contas ou os vínculos de funcionários; a tela não tratará a falha como uma lista vazia."
          retry={retry}
        />
      )}
      <div className="panel user-create-panel">
        <SectionTitle
          title="Criar usuário"
          subtitle="A senha deve ter pelo menos 12 caracteres."
        />
        <form
          className="admin-form-grid"
          onSubmit={event => {
            event.preventDefault();
            if (!dataReady) return;
            create.mutate({
              username: form.username,
              fullName: form.fullName,
              password: form.password,
              role: form.role,
              employeeId: form.employeeId ? Number(form.employeeId) : undefined,
            });
          }}
        >
          <div className="field">
            <Label htmlFor="user-full-name">Nome completo</Label>
            <Input
              id="user-full-name"
              required
              value={form.fullName}
              onChange={event =>
                setForm({ ...form, fullName: event.target.value })
              }
            />
          </div>
          <div className="field">
            <Label htmlFor="user-username">Nome de usuário</Label>
            <Input
              id="user-username"
              required
              minLength={3}
              value={form.username}
              onChange={event =>
                setForm({ ...form, username: event.target.value })
              }
            />
          </div>
          <div className="field">
            <Label htmlFor="user-role">Perfil</Label>
            <select
              id="user-role"
              className="form-select"
              value={form.role}
              onChange={event =>
                setForm({ ...form, role: event.target.value as User["role"] })
              }
            >
              <option value="frentista">Frentista</option>
              <option value="gerente">Gerente</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
          <div className="field">
            <Label htmlFor="user-employee">
              Funcionário vinculado (opcional)
            </Label>
            <select
              id="user-employee"
              className="form-select"
              value={form.employeeId}
              onChange={event =>
                setForm({ ...form, employeeId: event.target.value })
              }
              disabled={!dataReady}
            >
              <option value="">Sem vínculo</option>
              {staff.data
                ?.filter(employee => !employee.linkedUserId)
                .map(employee => (
                  <option value={employee.id} key={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <Label htmlFor="user-password">Senha inicial</Label>
            <Input
              id="user-password"
              required
              minLength={12}
              type="password"
              value={form.password}
              onChange={event =>
                setForm({ ...form, password: event.target.value })
              }
            />
          </div>
          <div className="admin-form-submit">
            <Button
              className="primary-button"
              disabled={create.isPending || !dataReady}
            >
              <Plus size={16} /> Criar conta
            </Button>
          </div>
        </form>
      </div>
      <div className="panel table-panel">
        <SectionTitle
          title="Contas cadastradas"
          subtitle={
            query.isLoading
              ? "Carregando…"
              : query.isError
                ? "Dados indisponíveis"
                : "Acesso individual"
          }
        />
        {query.isLoading ? (
          <div className="table-loading">Carregando contas…</div>
        ) : query.isError ? (
          <QueryError retry={retry} />
        ) : query.data?.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Tabela de usuários; deslize horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Último acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.map(user => (
                  <tr key={user.id}>
                    <td className="strong">{user.fullName}</td>
                    <td>{user.username}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td>
                      <span
                        className={`status-badge ${user.active ? "success" : "neutral"}`}
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("pt-BR")
                        : "Nunca"}
                    </td>
                    <td>
                      <button
                        className="table-action"
                        onClick={() =>
                          toggle.mutate({ id: user.id, active: !user.active })
                        }
                      >
                        {user.active ? "Desativar" : "Reativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel
            icon={UserCog}
            title="Nenhuma conta adicional"
            detail="Crie contas individuais para frentistas e gerentes."
          />
        )}
      </div>
    </>
  );
}

function SettingsPage() {
  const query = trpc.settings.get.useQuery();
  const [form, setForm] = useState<any>(null);
  const save = trpc.settings.update.useMutation({
    onSuccess: () => {
      query.refetch();
      toast.success("Configurações e preços atualizados.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (query.data && !form)
      setForm({
        legalName: query.data.unit?.legalName ?? "",
        tradeName: query.data.unit?.tradeName ?? "",
        cnpj: query.data.unit?.cnpj ?? "",
        address: query.data.unit?.address ?? "",
        city: query.data.unit?.city ?? "",
        state: query.data.unit?.state ?? "MA",
        postalCode: query.data.unit?.postalCode ?? "",
        gasoline: inputCurrency(query.data.prices.gasolina_comum),
        diesel: inputCurrency(query.data.prices.diesel_s10),
        tolerance: inputCurrency(query.data.toleranceCents),
      });
  }, [query.data, form]);
  if (query.isError)
    return (
      <>
        <PageHeading
          eyebrow="ADMINISTRAÇÃO"
          title="Configurações"
          description="Os valores não foram carregados; nada será presumido."
        />
        <QueryError retry={() => query.refetch()} />
      </>
    );
  if (query.isLoading || !form)
    return (
      <>
        <PageHeading
          eyebrow="ADMINISTRAÇÃO"
          title="Configurações"
          description="Dados empresariais, preços vigentes e tolerância da conferência."
        />
        <div className="panel table-loading">Carregando configurações…</div>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO"
        title="Configurações"
        description="Preços novos não alteram os fechamentos históricos."
      />
      <form
        className="settings-form"
        onSubmit={event => {
          event.preventDefault();
          save.mutate({
            legalName: form.legalName,
            tradeName: form.tradeName,
            cnpj: form.cnpj,
            address: form.address,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            gasolineCents: toCents(form.gasoline),
            dieselCents: toCents(form.diesel),
            toleranceCents: toCents(form.tolerance),
          });
        }}
      >
        <div className="panel settings-panel">
          <SectionTitle
            title="Dados da empresa"
            subtitle="Identificação exibida nos PDFs e relatórios"
          />
          <div className="form-grid">
            <div className="field">
              <Label htmlFor="setting-legal-name">Razão social</Label>
              <Input
                id="setting-legal-name"
                value={form.legalName}
                onChange={event =>
                  setForm({ ...form, legalName: event.target.value })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-trade-name">Nome fantasia</Label>
              <Input
                id="setting-trade-name"
                value={form.tradeName}
                onChange={event =>
                  setForm({ ...form, tradeName: event.target.value })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-cnpj">CNPJ</Label>
              <Input
                id="setting-cnpj"
                value={form.cnpj}
                onChange={event =>
                  setForm({ ...form, cnpj: event.target.value })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-address">Endereço</Label>
              <Input
                id="setting-address"
                value={form.address}
                onChange={event =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-city">Cidade</Label>
              <Input
                id="setting-city"
                value={form.city}
                onChange={event =>
                  setForm({ ...form, city: event.target.value })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-state">UF</Label>
              <Input
                id="setting-state"
                maxLength={2}
                value={form.state}
                onChange={event =>
                  setForm({ ...form, state: event.target.value.toUpperCase() })
                }
              />
            </div>
            <div className="field">
              <Label htmlFor="setting-postal-code">CEP</Label>
              <Input
                id="setting-postal-code"
                value={form.postalCode}
                onChange={event =>
                  setForm({ ...form, postalCode: event.target.value })
                }
              />
            </div>
          </div>
        </div>
        <div className="panel settings-panel">
          <SectionTitle
            title="Operação financeira"
            subtitle="Os preços são versionados e copiados no fechamento."
          />
          <div className="form-grid">
            <div className="field">
              <Label htmlFor="setting-gasoline-price">
                <FuelTypeBadge fuelType="gasolina_comum" />
                Preço por litro
              </Label>
              <div className="currency-input">
                <span>R$</span>
                <Input
                  id="setting-gasoline-price"
                  inputMode="decimal"
                  value={form.gasoline}
                  onChange={event =>
                    setForm({ ...form, gasoline: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="setting-diesel-price">
                <FuelTypeBadge fuelType="diesel_s10" />
                Preço por litro
              </Label>
              <div className="currency-input">
                <span>R$</span>
                <Input
                  id="setting-diesel-price"
                  inputMode="decimal"
                  value={form.diesel}
                  onChange={event =>
                    setForm({ ...form, diesel: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="field">
              <Label htmlFor="setting-tolerance">
                Tolerância de diferença (R$)
              </Label>
              <div className="currency-input">
                <span>R$</span>
                <Input
                  id="setting-tolerance"
                  inputMode="decimal"
                  value={form.tolerance}
                  onChange={event =>
                    setForm({ ...form, tolerance: event.target.value })
                  }
                />
              </div>
              <small>
                Diferenças dentro da tolerância serão classificadas como
                conferidas.
              </small>
            </div>
          </div>
        </div>
        <div className="settings-actions">
          <Button
            type="submit"
            className="primary-button"
            disabled={save.isPending}
            aria-busy={save.isPending}
          >
            <Check size={16} />
            {save.isPending ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </form>
    </>
  );
}

function AuditPage() {
  const query = trpc.audit.list.useQuery();
  return (
    <>
      <PageHeading
        eyebrow="RASTREABILIDADE"
        title="Auditoria do sistema"
        description="Histórico de operações administrativas e eventos registrados no backend."
      />
      <div className="panel table-panel">
        <SectionTitle
          title="Eventos recentes"
          subtitle={
            query.isLoading
              ? "Carregando…"
              : query.isError
                ? "Dados indisponíveis"
                : "Até 300 eventos mais recentes"
          }
        />
        {query.isLoading ? (
          <div className="table-loading">Carregando eventos…</div>
        ) : query.isError ? (
          <QueryError retry={() => query.refetch()} />
        ) : query.data?.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Tabela de auditoria; deslize horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Registro</th>
                  <th>Justificativa / detalhe</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map(row => (
                  <tr key={row.event.id}>
                    <td>
                      {new Date(row.event.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      {row.fullName}
                      <small>{row.username}</small>
                    </td>
                    <td>
                      <span className="audit-action">{row.event.action}</span>
                    </td>
                    <td>
                      {row.event.targetType} #{row.event.targetId}
                    </td>
                    <td>
                      <div className="audit-detail">
                        {row.event.reason && (
                          <p>
                            <strong>Justificativa</strong>
                            <span>{row.event.reason}</span>
                          </p>
                        )}
                        {row.event.field && (
                          <div className="audit-change">
                            <strong>{row.event.field}</strong>
                            <dl>
                              <div>
                                <dt>Anterior</dt>
                                <dd>{row.event.beforeValue ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Novo</dt>
                                <dd>{row.event.afterValue ?? "—"}</dd>
                              </div>
                            </dl>
                          </div>
                        )}
                        {!row.event.reason && !row.event.field && "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel
            icon={ShieldCheck}
            title="Ainda não há eventos"
            detail="Ações relevantes serão registradas com usuário e horário."
          />
        )}
      </div>
    </>
  );
}
