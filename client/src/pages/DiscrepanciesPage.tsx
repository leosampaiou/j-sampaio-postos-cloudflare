import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import QueryError from "@/components/QueryError";
import {
  exportManagementPdf,
  exportManagementXlsx,
} from "@/lib/managementExport";
import {
  canTransitionPayrollReview,
  payrollAdjustmentInitialStatuses,
  payrollAdjustmentStatuses,
  type PayrollAdjustmentInitialStatus,
} from "@shared/payrollReview";

type User = {
  id: number;
  unitId: number;
  username: string;
  fullName: string;
  role: "frentista" | "gerente" | "administrador";
  active: boolean;
};
const currentMonth = () =>
  new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .slice(0, 7);
const brl = (cents: number) =>
  ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const monthLabel = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return new Date(year, value - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
};
const dateLabel = (date: string) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const statusLabels: Record<string, string> = {
  pendente_analise: "Pendente de análise",
  em_investigacao: "Em investigação",
  justificada: "Justificada",
  encerrada_sem_desconto: "Encerrada sem desconto",
  encaminhada_administrativo: "Encaminhada à administração",
  resolvida: "Resolvida",
  cancelada_por_correcao: "Preservada após correção",
};
const adjustmentLabels: Record<string, string> = {
  nao_elegivel: "Não elegível",
  aguardando_analise: "Aguardando análise",
  aguardando_autorizacao: "Aguardando autorização",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  encaminhado_folha: "Encaminhado à folha",
  processado: "Processado",
};
const discrepancyStatuses = [
  "pendente_analise",
  "em_investigacao",
  "justificada",
  "encerrada_sem_desconto",
  "encaminhada_administrativo",
  "resolvida",
] as const;
const adjustmentStatuses = payrollAdjustmentStatuses;

export default function DiscrepanciesPage({ user }: { user: User }) {
  const isFrontline = user.role === "frentista";
  const isAdmin = user.role === "administrador";
  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState("");
  const [sortBy, setSortBy] = useState("shortageCents");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [analysisStatus, setAnalysisStatus] =
    useState<(typeof discrepancyStatuses)[number]>("pendente_analise");
  const [justification, setJustification] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewStatus, setReviewStatusValue] =
    useState<PayrollAdjustmentInitialStatus>("aguardando_analise");
  const utils = trpc.useUtils();
  const employeesQuery = trpc.discrepancies.employees.useQuery(undefined, {
    enabled: !isFrontline,
  });
  const ownAndAdminSummaries = trpc.discrepancies.employeeSummary.useQuery({
    month,
  });
  const list = trpc.discrepancies.list.useQuery({
    month,
    employeeId: !isFrontline && employeeId ? Number(employeeId) : undefined,
  });
  const trend = trpc.discrepancies.monthlyTrend.useQuery(
    isFrontline
      ? undefined
      : { employeeId: employeeId ? Number(employeeId) : undefined },
    { enabled: isFrontline || Boolean(employeeId) }
  );
  const monthly = trpc.discrepancies.monthlySummary.useQuery(
    { month, employeeId: Number(employeeId) },
    { enabled: !isFrontline && Boolean(employeeId) }
  );
  const adjustments = trpc.discrepancies.adjustments.useQuery(
    { month, employeeId: employeeId ? Number(employeeId) : undefined },
    { enabled: !isFrontline }
  );
  const updateAnalysis = trpc.discrepancies.updateAnalysis.useMutation();
  const evidenceTarget = trpc.discrepancies.evidenceUploadTarget.useMutation();
  const createReview = trpc.discrepancies.createAdjustmentReview.useMutation();
  const updatePayrollStatus =
    trpc.discrepancies.setAdjustmentStatus.useMutation();
  const summaries = ownAndAdminSummaries.data ?? [];
  const people = employeesQuery.data ?? [];
  type ClientDiscrepancyCase = NonNullable<typeof list.data>[number] & {
    justification?: string | null;
    reviewNotes?: string | null;
  };
  const cases = (list.data ?? []) as ClientDiscrepancyCase[];
  const chosenSummary = monthly.data;
  const ownSummary =
    summaries.find(item => item.employeeId === Number(employeeId)) ??
    summaries[0];
  const myMonthlyCases = cases.filter(
    item => item.status !== "cancelada_por_correcao"
  );
  const frontlineSurplus = myMonthlyCases
    .filter(item => item.type === "sobra")
    .reduce(
      (sum, item) =>
        sum +
        item.allocations.reduce(
          (part, allocation) => part + allocation.allocatedCents,
          0
        ),
      0
    );
  const frontlineShortage = myMonthlyCases
    .filter(item => item.type === "falta")
    .reduce(
      (sum, item) =>
        sum +
        item.allocations.reduce(
          (part, allocation) => part + allocation.allocatedCents,
          0
        ),
      0
    );
  const frontlineMonthly = {
    employee: { fullName: user.fullName },
    closures: ownSummary?.closures ?? 0,
    checked: ownSummary?.checked ?? 0,
    surplusCount: myMonthlyCases.filter(item => item.type === "sobra").length,
    shortageCount: myMonthlyCases.filter(item => item.type === "falta").length,
    surplusCents: frontlineSurplus,
    shortageCents: frontlineShortage,
    netCents: frontlineSurplus - frontlineShortage,
    occurrences: myMonthlyCases.map(item => ({
      ...item,
      allocatedCents: item.allocations.reduce(
        (sum, allocation) => sum + allocation.allocatedCents,
        0
      ),
    })),
  };
  const monthlyData = isFrontline ? frontlineMonthly : chosenSummary;
  const selectedCase = cases.find(item => item.id === Number(selectedCaseId));
  const trendRows = (trend.data ?? []).map(row => ({
    ...row,
    label: monthLabel(row.month),
  }));
  const sortedSummaries = useMemo(
    () =>
      [...summaries].sort((a, b) => {
        const first = (a as any)[sortBy] ?? 0;
        const second = (b as any)[sortBy] ?? 0;
        return typeof first === "string"
          ? first.localeCompare(second, "pt-BR")
          : Number(second) - Number(first);
      }),
    [summaries, sortBy]
  );
  const reportRows = useMemo(
    () =>
      sortedSummaries.map(row => ({
        Funcionário: row.employeeName,
        Fechamentos: row.closures,
        Conferidos: row.checked,
        "Ocorrências de sobra": row.surplusCount,
        "Ocorrências de falta": row.shortageCount,
        "Total de sobras": brl(row.surplusCents),
        "Total de faltas": brl(row.shortageCents),
        "Saldo líquido": brl(row.netCents),
        Pendentes: row.openCases,
        Justificadas: row.justifiedCases,
        "Ajustes aprovados": brl(row.approvedAdjustmentCents),
      })),
    [sortedSummaries]
  );

  useEffect(() => {
    if (!isFrontline && !employeeId && people.length)
      setEmployeeId(
        String(people.find(person => person.active)?.id ?? people[0].id)
      );
  }, [employeeId, isFrontline, people]);
  useEffect(() => {
    if (!selectedCase) return;
    setAnalysisStatus(
      selectedCase.status === "cancelada_por_correcao"
        ? "pendente_analise"
        : (selectedCase.status as (typeof discrepancyStatuses)[number])
    );
    setJustification(selectedCase.justification ?? "");
    setReviewNotes(selectedCase.reviewNotes ?? "");
    setEvidenceFile(null);
    setReviewAmount("");
    setReviewReason("");
    setReviewStatusValue("aguardando_analise");
  }, [
    selectedCase?.id,
    selectedCase?.status,
    selectedCase?.justification,
    selectedCase?.reviewNotes,
  ]);

  const exportMonthly = (format: "pdf" | "xlsx") => {
    const rows = (monthlyData?.occurrences ?? []).map(row => ({
      Data: dateLabel(row.closureDate),
      Turno: row.shift,
      Tipo: row.type === "sobra" ? "Sobra" : "Falta",
      Valor: brl(row.allocatedCents),
      Status: statusLabels[row.status] ?? row.status,
      Justificativa: row.justification ?? "—",
      "Responsável pela conferência": row.responsibleName ?? "—",
    }));
    if (!rows.length) {
      toast.info("Não há ocorrências no resumo mensal para exportar.");
      return;
    }
    const name = `Divergencias_${month}_${(monthlyData?.employee.fullName ?? user.fullName).replace(/[^A-Za-z0-9]+/g, "_")}`;
    if (format === "xlsx")
      void exportManagementXlsx("Divergências", rows, `${name}.xlsx`).catch(
        () => toast.error("Não foi possível criar o Excel.")
      );
    else
      exportManagementPdf(
        `Fechamento mensal de divergências — ${monthLabel(month)}`,
        [
          { header: "Data", key: "Data" },
          { header: "Turno", key: "Turno" },
          { header: "Tipo", key: "Tipo" },
          { header: "Valor", key: "Valor" },
          { header: "Status", key: "Status" },
          { header: "Justificativa", key: "Justificativa" },
          { header: "Responsável", key: "Responsável pela conferência" },
        ],
        rows,
        `${name}.pdf`
      );
  };
  const exportAdmin = (format: "pdf" | "xlsx") => {
    if (!reportRows.length) {
      toast.info("Não há dados de divergências para exportar.");
      return;
    }
    if (format === "xlsx")
      void exportManagementXlsx(
        "Resumo mensal",
        reportRows,
        `Relatorio_Divergencias_${month}.xlsx`
      ).catch(() => toast.error("Não foi possível criar o Excel."));
    else
      exportManagementPdf(
        `Relatório administrativo de divergências — ${monthLabel(month)}`,
        Object.keys(reportRows[0]).map(key => ({ header: key, key })),
        reportRows,
        `Relatorio_Divergencias_${month}.pdf`
      );
  };

  const saveAnalysis = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCase) {
      toast.error("Selecione uma ocorrência para analisar.");
      return;
    }
    if (
      [
        "justificada",
        "encerrada_sem_desconto",
        "encaminhada_administrativo",
        "resolvida",
      ].includes(analysisStatus) &&
      !justification.trim() &&
      !reviewNotes.trim()
    ) {
      toast.error(
        "Registre uma justificativa ou comentário antes de concluir."
      );
      return;
    }
    try {
      let evidenceKey: string | undefined;
      if (evidenceFile) {
        const allowed = ["application/pdf", "image/jpeg", "image/png"];
        if (
          !allowed.includes(evidenceFile.type) ||
          evidenceFile.size > 10 * 1024 * 1024
        ) {
          toast.error("A evidência deve ser PDF, JPG ou PNG, com até 10 MB.");
          return;
        }
        const target = await evidenceTarget.mutateAsync({
          caseId: selectedCase.id,
          fileName: evidenceFile.name,
          contentType: evidenceFile.type as
            | "application/pdf"
            | "image/jpeg"
            | "image/png",
          sizeBytes: evidenceFile.size,
        });
        const uploaded = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": target.contentType,
            "x-csrf-token": sessionStorage.getItem("jsampaio-csrf") ?? "",
          },
          body: evidenceFile,
        });
        if (!uploaded.ok)
          throw new Error("O armazenamento recusou o envio da evidência.");
        evidenceKey = target.key;
      }
      await updateAnalysis.mutateAsync({
        caseId: selectedCase.id,
        status: analysisStatus,
        justification: justification.trim() || undefined,
        reviewNotes: reviewNotes.trim() || undefined,
        evidenceKey,
      });
      setEvidenceFile(null);
      await Promise.all([
        utils.discrepancies.list.invalidate(),
        utils.discrepancies.employeeSummary.invalidate(),
        utils.discrepancies.monthlyTrend.invalidate(),
      ]);
      toast.success(
        "Análise registrada e auditada. Nenhum desconto foi aplicado."
      );
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível salvar a análise.");
    }
  };

  const submitPayrollReview = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    const employee = Number(employeeId);
    if (!selectedCase || !employee) {
      toast.error("Selecione funcionário e ocorrência.");
      return;
    }
    if (reviewReason.trim().length < 10) {
      toast.error(
        "A justificativa documentada deve ter pelo menos 10 caracteres."
      );
      return;
    }
    try {
      await createReview.mutateAsync({
        caseId: selectedCase.id,
        employeeId: employee,
        referenceMonth: month,
        approvedAmountCents: reviewAmount
          ? Math.round(Number(reviewAmount.replace(",", ".")) * 100)
          : undefined,
        justification: reviewReason.trim(),
        status: reviewStatus,
      });
      setReviewAmount("");
      setReviewReason("");
      await Promise.all([
        utils.discrepancies.adjustments.invalidate(),
        utils.discrepancies.employeeSummary.invalidate(),
      ]);
      toast.success(
        "Análise de folha registrada. Nenhum desconto ou envio à folha foi realizado."
      );
    } catch (error: any) {
      toast.error(
        error.message ?? "Não foi possível criar a análise de folha."
      );
    }
  };

  const submitAdminDecision = async (
    event: React.FormEvent<HTMLFormElement>,
    reviewId: number,
    amount: string,
    status: (typeof adjustmentStatuses)[number],
    reason: string
  ) => {
    event.preventDefault();
    if (reason.trim().length < 10) {
      toast.error(
        "A decisão administrativa deve ter justificativa documentada."
      );
      return;
    }
    const cents = amount
      ? Math.round(Number(amount.replace(",", ".")) * 100)
      : undefined;
    try {
      await updatePayrollStatus.mutateAsync({
        id: reviewId,
        status,
        approvedAmountCents: cents,
        justification: reason.trim(),
      });
      await Promise.all([
        utils.discrepancies.adjustments.invalidate(),
        utils.discrepancies.employeeSummary.invalidate(),
      ]);
      toast.success(
        "Decisão administrativa registrada; o sistema não executou nenhum desconto."
      );
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível atualizar a análise.");
    }
  };

  const selectedEmployee = isFrontline
    ? undefined
    : people.find(person => person.id === Number(employeeId));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            REGISTRO OBJETIVO · SEM PRESUNÇÃO DE CULPA
          </span>
          <h1>Controle de divergências</h1>
          <p>
            Histórico individual, consolidação mensal e análise documentada das
            ocorrências.
          </p>
        </div>
        <div
          className="heading-actions discrepancy-filter-controls"
          role="group"
          aria-label="Filtros do relatório de divergências"
        >
          <div className="field">
            <Label htmlFor="discrepancy-month">Mês de referência</Label>
            <Input
              id="discrepancy-month"
              type="month"
              value={month}
              onChange={event => setMonth(event.target.value)}
            />
          </div>
          {!isFrontline && (
            <div className="field">
              <Label htmlFor="discrepancy-employee">Funcionário</Label>
              <select
                id="discrepancy-employee"
                className="form-select"
                value={employeeId}
                onChange={event => setEmployeeId(event.target.value)}
              >
                <option value="">Todos / selecione</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                    {!person.active ? " (inativo)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {(employeesQuery.isError ||
        ownAndAdminSummaries.isError ||
        list.isError ||
        trend.isError ||
        monthly.isError ||
        adjustments.isError) && (
        <QueryError
          message="Algumas consultas de divergências falharam; confira os avisos nas seções antes de interpretar valores ou listas."
          retry={() =>
            void Promise.all([
              employeesQuery.refetch(),
              ownAndAdminSummaries.refetch(),
              list.refetch(),
              trend.refetch(),
              monthly.refetch(),
              adjustments.refetch(),
            ])
          }
        />
      )}
      <div className="discrepancy-notice">
        <ShieldCheck size={18} />
        <p>
          <strong>Este módulo registra e analisa; não aplica descontos.</strong>{" "}
          Divergências não presumem culpa. Qualquer encaminhamento relacionado à
          folha depende de análise individual, justificativa e autorização
          administrativa/legal.
        </p>
      </div>

      {isFrontline ? (
        <div className="section-block">
          <div className="section-title">
            <div>
              <h2>Meu resumo mensal</h2>
              <small>{monthLabel(month)}</small>
            </div>
            <div className="heading-actions">
              <Button variant="outline" onClick={() => exportMonthly("pdf")}>
                <FileText size={15} /> PDF
              </Button>
              <Button variant="outline" onClick={() => exportMonthly("xlsx")}>
                <FileSpreadsheet size={15} /> Excel
              </Button>
            </div>
          </div>
          {ownAndAdminSummaries.isError || list.isError ? (
            <QueryError
              retry={() =>
                void Promise.all([
                  ownAndAdminSummaries.refetch(),
                  list.refetch(),
                ])
              }
            />
          ) : (
            <MonthlyStats data={monthlyData} />
          )}
        </div>
      ) : (
        <div className="section-block">
          <div className="section-title">
            <div>
              <h2>
                {selectedEmployee
                  ? `Resumo de ${selectedEmployee.fullName}`
                  : "Resumo mensal individual"}
              </h2>
              <small>{monthLabel(month)}</small>
            </div>
            <div className="heading-actions">
              <Button variant="outline" onClick={() => exportMonthly("pdf")}>
                <FileText size={15} /> PDF mensal
              </Button>
              <Button variant="outline" onClick={() => exportMonthly("xlsx")}>
                <FileSpreadsheet size={15} /> Excel
              </Button>
            </div>
          </div>
          {selectedEmployee ? (
            monthly.isError ? (
              <QueryError retry={() => monthly.refetch()} />
            ) : monthly.isLoading ? (
              <div className="panel table-loading">
                Carregando fechamento mensal…
              </div>
            ) : (
              <MonthlyStats data={monthlyData} />
            )
          ) : (
            <div className="panel tank-empty">
              Selecione um funcionário para consultar o fechamento mensal
              individual.
            </div>
          )}
        </div>
      )}

      <div className="discrepancy-chart-grid">
        <section className="panel discrepancy-chart-panel">
          <div className="section-title">
            <div>
              <h2>Evolução mensal dos valores</h2>
              <small>
                Valores individuais, sem compensar sobras com faltas
              </small>
            </div>
          </div>
          {trend.isError ? (
            <QueryError retry={() => trend.refetch()} />
          ) : trendRows.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendRows}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="surplusFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#31956c"
                        stopOpacity={0.24}
                      />
                      <stop offset="95%" stopColor="#31956c" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="shortageFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#cf5454" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#cf5454" stopOpacity={0} />
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
                    tick={{ fontSize: 9, fill: "#7b8492" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#7b8492" }}
                    tickFormatter={value => `R$${Math.round(value / 100)}`}
                  />
                  <Tooltip formatter={(value: any) => brl(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="surplusCents"
                    name="Sobras"
                    stroke="#31956c"
                    fill="url(#surplusFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="shortageCents"
                    name="Faltas"
                    stroke="#cf5454"
                    fill="url(#shortageFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="tank-empty">Sem dados de evolução disponíveis.</div>
          )}
        </section>
        <section className="panel discrepancy-chart-panel">
          <div className="section-title">
            <div>
              <h2>Frequência das ocorrências</h2>
              <small>Sobras e faltas por mês</small>
            </div>
          </div>
          {trend.isError ? (
            <QueryError retry={() => trend.refetch()} />
          ) : trendRows.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trendRows}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e9edf3"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#7b8492" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#7b8492" }}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="surplusCount"
                    name="Sobras"
                    fill="#31956c"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="shortageCount"
                    name="Faltas"
                    fill="#cf5454"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="tank-empty">
              Sem dados de frequência disponíveis.
            </div>
          )}
        </section>
      </div>

      <section className="panel discrepancy-history-panel">
        <div className="section-title">
          <div>
            <h2>
              {isFrontline
                ? "Minhas ocorrências"
                : "Histórico individual de divergências"}
            </h2>
            <small>
              Ocorrências preservadas separadamente · {cases.length} no filtro
              atual
            </small>
          </div>
        </div>
        {list.isError ? (
          <QueryError retry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="table-loading">Carregando ocorrências…</div>
        ) : cases.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Tabela de ocorrências individuais; deslize horizontalmente para ver todas as colunas"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Turno</th>
                  <th>Funcionário / alocação</th>
                  <th>Tipo</th>
                  <th>Valor atribuído</th>
                  <th>Status</th>
                  <th>Justificativa</th>
                  <th>Conferente</th>
                  {!isFrontline && <th>Análise</th>}
                </tr>
              </thead>
              <tbody>
                {cases.map(row => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.closureDate)}</td>
                    <td>{row.shift}</td>
                    <td>
                      {row.allocations
                        .map(
                          item =>
                            `${item.employeeName}: ${brl(item.allocatedCents)}`
                        )
                        .join("; ") || "Sem imputação individual"}
                    </td>
                    <td>
                      <span className={`discrepancy-type ${row.type}`}>
                        {row.type === "sobra" ? "Sobra" : "Falta"}
                      </span>
                    </td>
                    <td
                      className={`tabular ${row.type === "sobra" ? "text-success" : "text-danger"}`}
                    >
                      {brl(
                        row.allocations.reduce(
                          (sum, item) => sum + item.allocatedCents,
                          0
                        )
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${row.status === "justificada" || row.status === "resolvida" || row.status === "encerrada_sem_desconto" ? "success" : row.status === "pendente_analise" ? "warning" : "neutral"}`}
                      >
                        {statusLabels[row.status] ?? row.status}
                      </span>
                    </td>
                    <td>{row.justification || "—"}</td>
                    <td>{row.responsibleName || "—"}</td>
                    {!isFrontline && (
                      <td>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCaseId(String(row.id))}
                        >
                          Analisar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tank-empty">
            Nenhuma ocorrência individual encontrada neste mês.
          </div>
        )}
      </section>

      {!isFrontline && (
        <>
          <section className="panel discrepancy-analysis-panel">
            <div className="section-title">
              <div>
                <h2>Análise da ocorrência</h2>
                <small>
                  Registre o contexto e a decisão; não há desconto automático.
                </small>
              </div>
              <AlertTriangle size={18} />
            </div>
            {!selectedCase ? (
              <div className="tank-empty">
                Selecione “Analisar” em uma ocorrência para registrar
                comentários, justificativa, evidência e resultado.
              </div>
            ) : selectedCase.status === "cancelada_por_correcao" ? (
              <div className="tank-empty">
                Esta ocorrência foi preservada para auditoria, mas o fechamento
                corrigido removeu a divergência; ela não pode receber nova
                decisão.
              </div>
            ) : (
              <>
                <div className="discrepancy-selected-case">
                  <strong>
                    {selectedCase.type === "sobra" ? "Sobra" : "Falta"} ·{" "}
                    {dateLabel(selectedCase.closureDate)} · {selectedCase.shift}
                  </strong>
                  <span>
                    {brl(selectedCase.amountCents)} originalmente identificado ·
                    Fechamento #{selectedCase.closureId}
                  </span>
                  <span>
                    Responsáveis/alocações:{" "}
                    {selectedCase.allocations
                      .map(
                        item =>
                          `${item.employeeName} (${brl(item.allocatedCents)})`
                      )
                      .join("; ") || "Sem alocação individual"}
                  </span>
                </div>
                <form className="discrepancy-form-grid" onSubmit={saveAnalysis}>
                  <div className="field">
                    <Label htmlFor="analysis-status">
                      Status da ocorrência
                    </Label>
                    <select
                      id="analysis-status"
                      className="form-select"
                      value={analysisStatus}
                      onChange={event =>
                        setAnalysisStatus(
                          event.target
                            .value as (typeof discrepancyStatuses)[number]
                        )
                      }
                    >
                      {discrepancyStatuses.map(status => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field discrepancy-form-wide">
                    <Label htmlFor="analysis-justification">
                      Justificativa / causa apurada
                    </Label>
                    <textarea
                      id="analysis-justification"
                      className="form-textarea"
                      rows={3}
                      maxLength={4000}
                      value={justification}
                      onChange={event => setJustification(event.target.value)}
                      placeholder="Investigue erros de registro, conferência, falhas operacionais e outras causas; não presuma culpa."
                    />
                  </div>
                  <div className="field discrepancy-form-wide">
                    <Label htmlFor="analysis-notes">
                      Comentários e resultado da análise
                    </Label>
                    <textarea
                      id="analysis-notes"
                      className="form-textarea"
                      rows={3}
                      maxLength={4000}
                      value={reviewNotes}
                      onChange={event => setReviewNotes(event.target.value)}
                      placeholder="Registre a decisão, responsável e próximos passos."
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="analysis-evidence">
                      Evidência (PDF, JPG ou PNG; até 10 MB)
                    </Label>
                    <Input
                      id="analysis-evidence"
                      key={selectedCase.id}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={event =>
                        setEvidenceFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                  <div className="discrepancy-form-actions">
                    <Button
                      className="primary-button"
                      disabled={
                        updateAnalysis.isPending || evidenceTarget.isPending
                      }
                    >
                      <Upload size={15} />
                      {updateAnalysis.isPending || evidenceTarget.isPending
                        ? "Salvando…"
                        : "Salvar análise auditada"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </section>

          <section className="panel payroll-section">
            <div className="section-title">
              <div>
                <h2>Análise de ajustes de folha</h2>
                <small>
                  Registro administrativo para avaliação individual; nunca
                  executa desconto.
                </small>
              </div>
            </div>
            {selectedCase && (
              <form
                className="discrepancy-form-grid payroll-create-form"
                onSubmit={submitPayrollReview}
              >
                <div className="field">
                  <Label htmlFor="payroll-selected-case">
                    Ocorrência selecionada
                  </Label>
                  <Input
                    id="payroll-selected-case"
                    value={`#${selectedCase.id} · ${selectedCase.type} · ${brl(selectedCase.amountCents)}`}
                    readOnly
                  />
                </div>
                <div className="field">
                  <Label htmlFor="payroll-review-amount">
                    Valor em análise (R$)
                  </Label>
                  <Input
                    id="payroll-review-amount"
                    inputMode="decimal"
                    value={reviewAmount}
                    onChange={event => setReviewAmount(event.target.value)}
                    placeholder="Opcional; não pode superar o valor alocado"
                  />
                </div>
                <div className="field">
                  <Label htmlFor="payroll-review-status">Status inicial</Label>
                  <select
                    id="payroll-review-status"
                    className="form-select"
                    value={reviewStatus}
                    onChange={event =>
                      setReviewStatusValue(
                        event.target.value as typeof reviewStatus
                      )
                    }
                  >
                    {payrollAdjustmentInitialStatuses.map(status => (
                      <option key={status} value={status}>
                        {adjustmentLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field discrepancy-form-wide">
                  <Label htmlFor="payroll-review-reason">
                    Justificativa documentada (mínimo 10 caracteres)
                  </Label>
                  <textarea
                    id="payroll-review-reason"
                    className="form-textarea"
                    rows={2}
                    minLength={10}
                    maxLength={4000}
                    value={reviewReason}
                    onChange={event => setReviewReason(event.target.value)}
                    required
                  />
                </div>
                <div className="discrepancy-form-actions">
                  <Button
                    className="primary-button"
                    disabled={
                      createReview.isPending ||
                      selectedCase.status === "cancelada_por_correcao"
                    }
                  >
                    <FileText size={15} /> Registrar análise
                  </Button>
                </div>
              </form>
            )}
            {!selectedCase && (
              <div className="tank-empty">
                Selecione uma ocorrência no histórico para iniciar uma análise
                individual.
              </div>
            )}
            {adjustments.isError ? (
              <QueryError retry={() => adjustments.refetch()} />
            ) : (adjustments.data ?? []).length ? (
              <div
                className="table-scroll"
                role="region"
                aria-label="Tabela de análises administrativas de folha; deslize horizontalmente para ver todas as colunas"
                tabIndex={0}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>Mês</th>
                      <th>Ocorrência</th>
                      <th>Valor identificado</th>
                      <th>Valor em análise/aprovado</th>
                      <th>Justificativa</th>
                      <th>Status</th>
                      <th>Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adjustments.data ?? []).map(row => (
                      <tr key={row.review.id}>
                        <td>{row.employeeName}</td>
                        <td>{row.review.referenceMonth}</td>
                        <td>
                          #{row.closureId} · {row.caseType}
                        </td>
                        <td>{brl(row.review.originalAmountCents)}</td>
                        <td>
                          {row.review.approvedAmountCents == null
                            ? "—"
                            : brl(row.review.approvedAmountCents)}
                        </td>
                        <td>{row.review.justification}</td>
                        <td>
                          {row.isCurrentRevision
                            ? (adjustmentLabels[row.review.status] ??
                              row.review.status)
                            : "Revisão anterior"}
                        </td>
                        <td>
                          {!row.isCurrentRevision ? (
                            "Fechamento corrigido; decisão preservada apenas no histórico."
                          ) : isAdmin &&
                            !["processado", "rejeitado"].includes(
                              row.review.status
                            ) ? (
                            <AdminDecisionForm
                              row={row}
                              busy={updatePayrollStatus.isPending}
                              onSubmit={submitAdminDecision}
                            />
                          ) : row.review.approvalBy ? (
                            "Decisão registrada"
                          ) : (
                            "Aguardando administração"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !adjustments.isLoading && (
                <div className="tank-empty">
                  Nenhuma análise de folha registrada para o filtro selecionado.
                </div>
              )
            )}
          </section>

          <section className="panel admin-discrepancy-report">
            <div className="section-title">
              <div>
                <h2>Relatório mensal administrativo</h2>
                <small>
                  Todos os funcionários; sem classificação de culpabilidade
                </small>
              </div>
              <div className="heading-actions">
                <div className="field">
                  <Label htmlFor="discrepancy-sort">Ordenar por</Label>
                  <select
                    id="discrepancy-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={event => setSortBy(event.target.value)}
                  >
                    <option value="shortageCents">Valor de faltas</option>
                    <option value="shortageCount">Quantidade de faltas</option>
                    <option value="surplusCents">Valor de sobras</option>
                    <option value="surplusCount">Quantidade de sobras</option>
                    <option value="closures">Fechamentos</option>
                    <option value="employeeName">Nome</option>
                  </select>
                </div>
                <Button variant="outline" onClick={() => exportAdmin("pdf")}>
                  <FileText size={15} /> PDF
                </Button>
                <Button variant="outline" onClick={() => exportAdmin("xlsx")}>
                  <FileSpreadsheet size={15} /> Excel
                </Button>
              </div>
            </div>
            {ownAndAdminSummaries.isError ? (
              <QueryError retry={() => ownAndAdminSummaries.refetch()} />
            ) : reportRows.length ? (
              <div
                className="table-scroll"
                role="region"
                aria-label="Relatório mensal administrativo de divergências; deslize horizontalmente para ver todas as colunas"
                tabIndex={0}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Funcionário</th>
                      <th>Fechamentos</th>
                      <th>Conferidos</th>
                      <th>Sobras</th>
                      <th>Faltas</th>
                      <th>Total sobras</th>
                      <th>Total faltas</th>
                      <th>Saldo</th>
                      <th>Pendentes</th>
                      <th>Justificadas</th>
                      <th>Ajustes aprovados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummaries.map(row => (
                      <tr key={row.employeeId}>
                        <td>{row.employeeName}</td>
                        <td>{row.closures}</td>
                        <td>{row.checked}</td>
                        <td>{row.surplusCount}</td>
                        <td>{row.shortageCount}</td>
                        <td className="text-success">
                          {brl(row.surplusCents)}
                        </td>
                        <td className="text-danger">
                          {brl(row.shortageCents)}
                        </td>
                        <td>{brl(row.netCents)}</td>
                        <td>{row.openCases}</td>
                        <td>{row.justifiedCases}</td>
                        <td>{brl(row.approvedAdjustmentCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="tank-empty">
                Não há resumos de funcionários para este período.
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function MonthlyStats({ data }: { data: any }) {
  if (!data)
    return (
      <div className="panel tank-empty">
        Selecione um funcionário e aguarde o resumo mensal.
      </div>
    );
  const stats = [
    ["Fechamentos", data.closures],
    ["Fechamentos conferidos", data.checked],
    ["Ocorrências de sobra", data.surplusCount],
    ["Ocorrências de falta", data.shortageCount],
    ["Total de sobras", brl(data.surplusCents)],
    ["Total de faltas", brl(data.shortageCents)],
    ["Saldo líquido", brl(data.netCents)],
  ];
  return (
    <div className="discrepancy-stats-grid">
      {stats.map(([label, value]) => (
        <article className="panel discrepancy-stat-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {label === "Saldo líquido" && (
            <small>
              {data.netCents > 0
                ? "Saldo positivo"
                : data.netCents < 0
                  ? "Saldo negativo"
                  : "Saldo zerado"}
            </small>
          )}
        </article>
      ))}
    </div>
  );
}

function AdminDecisionForm({
  row,
  busy,
  onSubmit,
}: {
  row: any;
  busy: boolean;
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    reviewId: number,
    amount: string,
    status: (typeof adjustmentStatuses)[number],
    reason: string
  ) => Promise<void>;
}) {
  const [amount, setAmount] = useState(
    row.review.approvedAmountCents == null
      ? ""
      : (row.review.approvedAmountCents / 100).toFixed(2)
  );
  const [status, setStatus] = useState<(typeof adjustmentStatuses)[number]>(
    row.review.status
  );
  const [reason, setReason] = useState(row.review.justification ?? "");
  return (
    <form
      className="admin-review-decision"
      onSubmit={event =>
        void onSubmit(event, row.review.id, amount, status, reason)
      }
    >
      <select
        aria-label="Decisão administrativa"
        className="form-select"
        value={status}
        onChange={event => setStatus(event.target.value as typeof status)}
      >
        {adjustmentStatuses
          .filter(value => canTransitionPayrollReview(row.review.status, value))
          .map(value => (
            <option value={value} key={value}>
              {adjustmentLabels[value]}
            </option>
          ))}
      </select>
      <Input
        aria-label="Valor aprovado em reais"
        inputMode="decimal"
        value={amount}
        onChange={event => setAmount(event.target.value)}
        placeholder="Valor (R$)"
      />
      <Input
        aria-label="Justificativa administrativa"
        value={reason}
        onChange={event => setReason(event.target.value)}
        minLength={10}
        required
        placeholder="Justificativa documentada"
      />
      <Button variant="outline" size="sm" disabled={busy}>
        <CheckCircle2 size={14} /> Registrar decisão
      </Button>
    </form>
  );
}
