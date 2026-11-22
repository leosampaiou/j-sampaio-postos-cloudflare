import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Fuel,
  Gauge,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import QueryError from "@/components/QueryError";
import {
  FuelTypeBadge,
  FuelTypeFilter,
  FuelTypeRadioGroup,
} from "@/components/FuelType";
import TankSampleCoverageNotice from "@/components/TankSampleCoverageNotice";
import { FUEL_TYPES, fuelTypeLabel } from "@shared/fuel";
import {
  exportManagementPdf,
  exportManagementXlsx,
} from "@/lib/managementExport";

type User = {
  id: number;
  unitId: number;
  username: string;
  fullName: string;
  role: "frentista" | "gerente" | "administrador";
  active: boolean;
};
const movementNames: Record<string, string> = {
  opening: "Estoque inicial",
  receipt: "Entrada",
  sale: "Venda de fechamento",
  writeoff: "Baixa autorizada",
  correction: "Correção compensatória",
};
const money = (cents: number) =>
  ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const liters = (value: number | string) =>
  `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L`;
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const localDateTime = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
const toCents = (value: string) => {
  const number = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};
const freshIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2)}`;
const movementQuantity = (value: number | string) =>
  `${Number(value) > 0 ? "+" : ""}${liters(value)}`;

export default function StockPage({ user }: { user: User }) {
  const utils = trpc.useUtils();
  const canManageTanks = user.role === "administrador";
  const tanks = trpc.inventory.listTanks.useQuery();
  const [windowDays, setWindowDays] = useState<7 | 15 | 30>(7);
  const dashboard = trpc.inventory.dashboard.useQuery({ windowDays });
  const pumps = trpc.settings.pumps.useQuery();
  const [filterTank, setFilterTank] = useState("");
  const [filterFuel, setFilterFuel] = useState("");
  const [receiptTankId, setReceiptTankId] = useState("");
  const [measurementTankId, setMeasurementTankId] = useState("");
  const [writeoffTankId, setWriteoffTankId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const movements = trpc.inventory.movements.useQuery({
    tankId: filterTank ? Number(filterTank) : undefined,
    fuelType: FUEL_TYPES.find(fuelType => fuelType === filterFuel),
    movementType: filterType
      ? (filterType as
          | "opening"
          | "receipt"
          | "sale"
          | "writeoff"
          | "correction")
      : undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
  });
  const measurements = trpc.inventory.measurements.useQuery(undefined);
  const createTank = trpc.inventory.createTank.useMutation();
  const updateTank = trpc.inventory.updateTank.useMutation();
  const assignPump = trpc.inventory.assignPump.useMutation();
  const createReceipt = trpc.inventory.createReceipt.useMutation();
  const requestUpload = trpc.inventory.receiptUploadTarget.useMutation();
  const attachDocument = trpc.inventory.attachReceiptDocument.useMutation();
  const recordMeasurement = trpc.inventory.recordMeasurement.useMutation();
  const recordWriteoff = trpc.inventory.recordWriteoff.useMutation();
  const receiptKey = useRef(freshIdempotencyKey());
  const writeoffKey = useRef(freshIdempotencyKey());

  const refresh = async () => {
    await Promise.all([
      utils.inventory.listTanks.invalidate(),
      utils.inventory.dashboard.invalidate(),
      utils.inventory.movements.invalidate(),
      utils.inventory.measurements.invalidate(),
    ]);
  };
  const tankRows = tanks.data ?? [];
  const selectedTankFuel = (tankId: string) =>
    tankRows.find(tank => String(tank.id) === tankId)?.fuelType;
  const dashboardById = useMemo(
    () => new Map((dashboard.data?.tanks ?? []).map(item => [item.id, item])),
    [dashboard.data]
  );
  const activeCount = tankRows.filter(tank => tank.active).length;
  const totalLiters = (dashboard.data?.tanks ?? []).reduce(
    (sum, tank) => sum + tank.stockLiters,
    0
  );

  const submitTank = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fuelType = FUEL_TYPES.find(
      option => option === String(form.get("fuelType") ?? "")
    );
    if (!fuelType) {
      toast.error("Selecione um combustível válido para o tanque.");
      return;
    }
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      code: String(form.get("code") ?? "").trim(),
      fuelType,
      capacityTotalLiters: Number(form.get("capacityTotalLiters")),
      operationalCapacityLiters: Number(form.get("operationalCapacityLiters")),
      minimumStockLiters: Number(form.get("minimumStockLiters")),
      initialStockLiters: Number(form.get("initialStockLiters")),
      stockStartDate: String(form.get("stockStartDate") ?? ""),
      replenishmentLeadDays: Number(form.get("replenishmentLeadDays")),
      safetyReserveLiters: Number(form.get("safetyReserveLiters")),
      nearMinimumPercent: Number(form.get("nearMinimumPercent")),
      autonomyWarningDays: Number(form.get("autonomyWarningDays")),
      autonomyCriticalDays: Number(form.get("autonomyCriticalDays")),
      discrepancyAlertPercent: Number(form.get("discrepancyAlertPercent")),
      staleAfterDays: Number(form.get("staleAfterDays")),
    };
    try {
      await createTank.mutateAsync(payload);
      formElement.reset();
      await refresh();
      toast.success("Tanque cadastrado com estoque inicial auditado.");
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível cadastrar o tanque.");
    }
  };

  const submitReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file =
      form.get("document") instanceof File &&
      (form.get("document") as File).size > 0
        ? (form.get("document") as File)
        : null;
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("O comprovante deve ter até 10 MB.");
      return;
    }
    try {
      const result = await createReceipt.mutateAsync({
        tankId: Number(form.get("tankId")),
        supplier: String(form.get("supplier") ?? ""),
        invoiceNumber:
          String(form.get("invoiceNumber") ?? "").trim() || undefined,
        occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
        quantityLiters: Number(form.get("quantityLiters")),
        acquisitionValueCents: toCents(
          String(form.get("acquisitionValue") ?? "0")
        ),
        idempotencyKey: receiptKey.current,
        notes: String(form.get("notes") ?? "").trim() || undefined,
      });
      if (file && !result.duplicate) {
        try {
          const target = await requestUpload.mutateAsync({
            movementId: result.id,
            fileName: file.name,
            contentType: file.type as
              | "application/pdf"
              | "image/jpeg"
              | "image/png",
            sizeBytes: file.size,
          });
          const uploaded = await fetch(target.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": target.contentType,
              "x-csrf-token": sessionStorage.getItem("jsampaio-csrf") ?? "",
            },
            body: file,
          });
          if (!uploaded.ok)
            throw new Error("O armazenamento recusou o envio do comprovante.");
          await attachDocument.mutateAsync({
            movementId: result.id,
            documentKey: target.key,
          });
        } catch {
          toast.warning(
            "A entrada foi registrada, mas o comprovante não foi anexado. Você pode tentar anexá-lo depois pelo histórico."
          );
        }
      }
      receiptKey.current = freshIdempotencyKey();
      formElement.reset();
      setReceiptTankId("");
      await refresh();
      toast.success(
        result.duplicate
          ? "Esta entrada já havia sido registrada; nenhuma duplicidade foi criada."
          : "Entrada registrada e saldo atualizado."
      );
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível registrar a entrada.");
    }
  };

  const submitMeasurement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await recordMeasurement.mutateAsync({
        tankId: Number(form.get("tankId")),
        physicalLiters: Number(form.get("physicalLiters")),
        measuredAt: new Date(String(form.get("measuredAt"))).toISOString(),
        notes: String(form.get("notes") ?? "").trim() || undefined,
      });
      formElement.reset();
      setMeasurementTankId("");
      await refresh();
      toast.success(
        `Medição registrada. Diferença física/teórica: ${liters(result.differenceLiters)}.`
      );
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível salvar a medição.");
    }
  };

  const submitWriteoff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await recordWriteoff.mutateAsync({
        tankId: Number(form.get("tankId")),
        quantityLiters: Number(form.get("quantityLiters")),
        occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
        idempotencyKey: writeoffKey.current,
        reason: String(form.get("reason") ?? "").trim(),
      });
      writeoffKey.current = freshIdempotencyKey();
      formElement.reset();
      setWriteoffTankId("");
      await refresh();
      toast.success(
        result.duplicate
          ? "Esta baixa já havia sido registrada."
          : "Baixa autorizada e auditada."
      );
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível registrar a baixa.");
    }
  };

  const movementExportRows = (movements.data ?? []).map(row => {
    const quantity = Math.abs(Number(row.quantityLiters));
    const acquisitionCents =
      row.movementType === "receipt" ? row.acquisitionValueCents : null;
    return {
      Data: new Date(row.occurredAt).toLocaleString("pt-BR"),
      Tanque: `${row.tankName} (${row.tankCode})`,
      Combustível: fuelTypeLabel(row.fuelType),
      Tipo: movementNames[row.movementType] ?? row.movementType,
      Quantidade: Number(row.quantityLiters),
      "Saldo após movimento": Number(row.balanceAfterLiters),
      "Custo de aquisição":
        acquisitionCents === null ? "—" : money(acquisitionCents),
      "Custo por litro":
        acquisitionCents === null || quantity <= 0
          ? "—"
          : `${money(Math.round(acquisitionCents / quantity))}/L`,
      Responsável: row.responsible,
      Documento:
        row.invoiceNumber ?? row.documentKey ?? row.sourceClosureId ?? "—",
    };
  });
  const exportMovements = (format: "xlsx" | "pdf") => {
    if (!movementExportRows.length) {
      toast.info("Não há movimentos no filtro atual para exportar.");
      return;
    }
    if (format === "xlsx")
      void exportManagementXlsx(
        "Movimentos",
        movementExportRows,
        `Estoque_JSampaio_${today()}.xlsx`
      ).catch(() => toast.error("Não foi possível criar o arquivo Excel."));
    else
      exportManagementPdf(
        "Histórico de movimentações de estoque",
        [
          { header: "Data", key: "Data" },
          { header: "Tanque", key: "Tanque" },
          { header: "Combustível", key: "Combustível" },
          { header: "Movimento", key: "Tipo" },
          { header: "Quantidade", key: "Quantidade" },
          { header: "Saldo após", key: "Saldo após movimento" },
          { header: "Custo de aquisição", key: "Custo de aquisição" },
          { header: "Custo/L", key: "Custo por litro" },
          { header: "Responsável", key: "Responsável" },
          { header: "Documento", key: "Documento" },
        ],
        movementExportRows,
        `Estoque_JSampaio_${today()}.pdf`
      );
  };
  const exportStockSnapshot = (format: "xlsx" | "pdf") => {
    const rows = (dashboard.data?.tanks ?? []).map(tank => ({
      Tanque: `${tank.name} (${tank.code})`,
      Combustível: fuelTypeLabel(tank.fuelType),
      "Estoque teórico (L)": Number(tank.stockLiters),
      "Capacidade operacional (L)": Number(tank.operationalCapacityLiters),
      "Capacidade total (L)": Number(tank.capacityTotalLiters),
      "Ocupação (%)": Number(tank.occupiedPercent.toFixed(1)),
      "Consumo médio diário (L/dia)": Number(
        tank.averageDailyLiters.toFixed(3)
      ),
      "Janela da média (dias)": tank.averageWindowDays,
      "Autonomia (dias)": tank.autonomyDays ?? "Sem previsão",
      "Previsão de esgotamento": tank.expectedEmptyDate ?? "Sem previsão",
      "Reposição sugerida (L)": Number(tank.suggestedReplenishmentLiters),
      Situação: tank.stockHealth,
      "Última medição física (L)": tank.latestMeasurement
        ? Number(tank.latestMeasurement.physicalLiters)
        : "—",
      "Estoque teórico na medição (L)": tank.latestMeasurement
        ? Number(tank.latestMeasurement.theoreticalLiters)
        : "—",
      "Diferença físico/teórico (L)": tank.latestMeasurement
        ? Number(tank.latestMeasurement.differenceLiters)
        : "—",
      "Diferença físico/teórico (%)":
        tank.latestMeasurement?.differencePercent == null
          ? "—"
          : Number(tank.latestMeasurement.differencePercent),
    }));
    if (!rows.length) {
      toast.info("Não há tanques com dados reais para exportar.");
      return;
    }
    const file = `Posicao_Estoque_JSampaio_${today()}`;
    if (format === "xlsx")
      void exportManagementXlsx("Posição atual", rows, `${file}.xlsx`).catch(
        () => toast.error("Não foi possível criar o Excel.")
      );
    else
      exportManagementPdf(
        "Posição atual de estoque e tanques",
        Object.keys(rows[0]).map(key => ({ header: key, key })),
        rows,
        `${file}.pdf`
      );
  };

  const exportMeasurements = (format: "xlsx" | "pdf") => {
    const rows = (measurements.data ?? []).map(row => ({
      Data: new Date(row.measurement.measuredAt).toLocaleString("pt-BR"),
      Tanque: `${row.tankName} (${row.tankCode})`,
      "Volume físico (L)": Number(row.measurement.physicalLiters),
      "Teórico na medição (L)": Number(row.measurement.theoreticalLiters),
      "Diferença (L)": Number(row.measurement.differenceLiters),
      "Diferença (%)":
        row.measurement.differencePercent == null
          ? "—"
          : Number(row.measurement.differencePercent),
      Responsável: row.measuredByName,
      Observações: row.measurement.notes ?? "—",
    }));
    if (!rows.length) {
      toast.info("Não há medições físicas para exportar.");
      return;
    }
    const file = `Medicoes_Estoque_JSampaio_${today()}`;
    if (format === "xlsx")
      void exportManagementXlsx("Medições", rows, `${file}.xlsx`).catch(() =>
        toast.error("Não foi possível criar o Excel.")
      );
    else
      exportManagementPdf(
        "Histórico de medições físicas",
        Object.keys(rows[0]).map(key => ({ header: key, key })),
        rows,
        `${file}.pdf`
      );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROLE OPERACIONAL</span>
          <h1>Estoque e Tanques</h1>
          <p>
            Entradas, consumo teórico, medições físicas, alertas e planejamento
            de reposição.
          </p>
        </div>
        <div className="heading-actions">
          <div className="field">
            <Label htmlFor="stock-window">Janela média/autonomia</Label>
            <select
              id="stock-window"
              className="form-select"
              value={windowDays}
              onChange={event =>
                setWindowDays(Number(event.target.value) as 7 | 15 | 30)
              }
            >
              <option value={7}>7 dias</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw size={16} /> Atualizar
          </Button>
        </div>
      </div>
      {(tanks.isError || dashboard.isError || pumps.isError) && (
        <QueryError
          message="Uma ou mais consultas de estoque falharam; os registros não estão sendo tratados como vazios."
          retry={() =>
            void Promise.all([
              tanks.refetch(),
              dashboard.refetch(),
              pumps.refetch(),
            ])
          }
        />
      )}
      <div className="stock-summary-grid">
        <div className="panel stock-summary-card">
          <span>Tanques ativos</span>
          <strong>{tanks.isError ? "—" : activeCount}</strong>
          <small>Tanques inativos continuam no histórico</small>
        </div>
        <div className="panel stock-summary-card">
          <span>Estoque teórico total</span>
          <strong>
            {dashboard.isLoading || dashboard.isError
              ? "—"
              : liters(totalLiters)}
          </strong>
          <small>Somente tanques ativos com estoque cadastrado</small>
        </div>
        <div className="panel stock-summary-card">
          <span>Alertas ativos</span>
          <strong>
            {dashboard.isLoading || dashboard.isError
              ? "—"
              : (dashboard.data?.alerts.length ?? 0)}
          </strong>
          <small>Derivados dos limites de cada tanque</small>
        </div>
      </div>

      {canManageTanks && (
        <section className="panel stock-section">
          <div className="section-title">
            <div>
              <h2>Cadastrar tanque</h2>
              <small>
                O estoque inicial será lançado como movimento de abertura e
                auditado.
              </small>
            </div>
          </div>
          <form className="stock-form-grid" onSubmit={submitTank}>
            <div className="field">
              <Label>Nome / identificação</Label>
              <Input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Tanque subterrâneo 01"
              />
            </div>
            <div className="field">
              <Label>Código único</Label>
              <Input
                name="code"
                required
                pattern="[A-Za-z0-9._-]+"
                maxLength={40}
                placeholder="TQ-01"
              />
            </div>
            <div className="field">
              <Label>Combustível do tanque</Label>
              <FuelTypeRadioGroup
                name="fuelType"
                defaultValue="gasolina_comum"
                ariaLabel="Combustível do tanque"
              />
              <small>
                O tanque só poderá receber bicos do mesmo combustível.
              </small>
            </div>
            <div className="field">
              <Label>Capacidade total (L)</Label>
              <Input
                name="capacityTotalLiters"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                required
              />
            </div>
            <div className="field">
              <Label>Capacidade operacional (L)</Label>
              <Input
                name="operationalCapacityLiters"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                required
              />
            </div>
            <div className="field">
              <Label>Estoque mínimo (L)</Label>
              <Input
                name="minimumStockLiters"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                defaultValue="0"
                required
              />
            </div>
            <div className="field">
              <Label>Estoque inicial (L)</Label>
              <Input
                name="initialStockLiters"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                defaultValue="0"
                required
              />
            </div>
            <div className="field">
              <Label>Data inicial do estoque</Label>
              <Input
                name="stockStartDate"
                type="date"
                defaultValue={today()}
                required
              />
            </div>
            <div className="field">
              <Label>Prazo de entrega (dias)</Label>
              <Input
                name="replenishmentLeadDays"
                type="number"
                min="0"
                max="90"
                defaultValue="0"
                required
              />
            </div>
            <div className="field">
              <Label>Reserva de segurança (L)</Label>
              <Input
                name="safetyReserveLiters"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                defaultValue="0"
                required
              />
            </div>
            <div className="field">
              <Label>Faixa próximo do mínimo (%)</Label>
              <Input
                name="nearMinimumPercent"
                type="number"
                min="0"
                max="100"
                defaultValue="15"
                required
              />
            </div>
            <div className="field">
              <Label>Autonomia em atenção (dias)</Label>
              <Input
                name="autonomyWarningDays"
                type="number"
                min="1"
                max="30"
                defaultValue="3"
                required
              />
            </div>
            <div className="field">
              <Label>Autonomia crítica (dias)</Label>
              <Input
                name="autonomyCriticalDays"
                type="number"
                min="1"
                max="30"
                defaultValue="2"
                required
              />
            </div>
            <div className="field">
              <Label>Alerta divergência física (%)</Label>
              <Input
                name="discrepancyAlertPercent"
                type="number"
                min="0"
                max="100"
                step="0.001"
                defaultValue="2"
                required
              />
            </div>
            <div className="field">
              <Label>Sem atualização recente (dias)</Label>
              <Input
                name="staleAfterDays"
                type="number"
                min="1"
                max="365"
                defaultValue="7"
                required
              />
            </div>
            <div className="stock-form-actions">
              <Button
                className="primary-button"
                disabled={createTank.isPending}
              >
                <Plus size={16} />
                {createTank.isPending ? "Cadastrando…" : "Cadastrar tanque"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="stock-section">
        <div className="section-title">
          <div>
            <h2>Tanques e origem dos bicos</h2>
            <small>
              Os valores e alertas são calculados a partir do histórico
              persistido, sem amostras fictícias.
            </small>
          </div>
          <div className="heading-actions">
            <Button
              variant="outline"
              onClick={() => exportStockSnapshot("pdf")}
            >
              <Download size={15} /> Posição PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportStockSnapshot("xlsx")}
            >
              <FileSpreadsheet size={15} /> Posição Excel
            </Button>
          </div>
        </div>
        {tanks.isError ? (
          <QueryError retry={() => tanks.refetch()} />
        ) : tanks.isLoading ? (
          <div className="panel table-loading">Carregando tanques…</div>
        ) : !tankRows.length ? (
          <div className="panel tank-empty">
            <Warehouse size={22} />
            <strong>Nenhum tanque cadastrado</strong>
            <span>
              {canManageTanks
                ? "Cadastre o estoque real para iniciar o acompanhamento."
                : "Solicite ao administrador o cadastro e a configuração dos tanques."}
            </span>
          </div>
        ) : (
          <div className="tank-card-grid stock-page-tank-grid">
            {tankRows.map(tank => {
              const summary = dashboardById.get(tank.id);
              return (
                <article
                  className={`panel tank-card health-${summary?.stockHealth ?? "atencao"}`}
                  key={tank.id}
                >
                  <div className="tank-card-top">
                    <div>
                      <span className="tank-code">
                        {tank.code} · {tank.active ? "ATIVO" : "INATIVO"}
                      </span>
                      <h3>{tank.name}</h3>
                      <FuelTypeBadge fuelType={tank.fuelType} />
                    </div>
                    <span
                      className={`tank-health-badge health-${summary?.stockHealth ?? "atencao"}`}
                    >
                      {summary
                        ? summary.stockLiters <= Number(tank.minimumStockLiters)
                          ? "Abaixo do mínimo"
                          : summary.stockHealth
                        : "Sem resumo"}
                    </span>
                  </div>
                  {summary ? (
                    <>
                      <div className="tank-primary-stock">
                        <strong>{liters(summary.stockLiters)}</strong>
                        <span>
                          de {liters(tank.operationalCapacityLiters)}{" "}
                          operacionais · {liters(tank.capacityTotalLiters)}{" "}
                          totais
                        </span>
                      </div>
                      <div className="tank-progress-track">
                        <span
                          className={`tank-progress-value health-${summary.stockHealth}`}
                          style={{
                            width: `${Math.min(100, summary.occupiedPercent)}%`,
                          }}
                        />
                      </div>
                      <div className="tank-progress-label">
                        <span>
                          {summary.occupiedPercent.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}
                          % ocupado
                        </span>
                        <span>mínimo {liters(tank.minimumStockLiters)}</span>
                      </div>
                      <div className="tank-key-metrics">
                        <div>
                          <span>Autonomia</span>
                          <strong>
                            {summary.autonomyDays === null
                              ? "Sem previsão"
                              : `${summary.autonomyDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`}
                          </strong>
                        </div>
                        <div>
                          <span>
                            Média diária (
                            {summary.averageWindowDays ?? windowDays} dias)
                          </span>
                          <strong>
                            {summary.averageDailyLiters > 0
                              ? `${liters(summary.averageDailyLiters)}/dia`
                              : "Sem histórico"}
                          </strong>
                        </div>
                        <div>
                          <span>Previsão de esgotamento</span>
                          <strong>
                            {summary.expectedEmptyDate ?? "Sem previsão"}
                          </strong>
                        </div>
                        <div>
                          <span>Reposição sugerida</span>
                          <strong>
                            {summary.suggestedReplenishmentLiters > 0
                              ? liters(summary.suggestedReplenishmentLiters)
                              : "Sem sugestão"}
                          </strong>
                        </div>
                      </div>
                      {summary.dataQuality === "baixa" && (
                        <TankSampleCoverageNotice
                          availableDays={summary.averageSampleDays}
                          windowDays={windowDays}
                          sampleStartDate={summary.averageSampleStartDate}
                        />
                      )}
                      {summary.latestMeasurement && (
                        <p className="tank-measurement-note">
                          Última medição física{" "}
                          {liters(summary.latestMeasurement.physicalLiters)};
                          teórico preservado{" "}
                          {liters(summary.latestMeasurement.theoreticalLiters)}.
                        </p>
                      )}
                      {summary.alerts.map(alert => (
                        <p
                          className={`stock-alert-line ${alert.severity}`}
                          key={alert.code}
                        >
                          <CircleAlert size={14} />
                          {alert.message}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="tank-data-quality">
                      Este tanque está inativo e não entra na projeção
                      operacional.
                    </p>
                  )}
                  {canManageTanks && (
                    <div className="tank-admin-actions">
                      <Button
                        variant="outline"
                        disabled={updateTank.isPending}
                        onClick={async () => {
                          try {
                            await updateTank.mutateAsync({
                              id: tank.id,
                              name: tank.name,
                              capacityTotalLiters: Number(
                                tank.capacityTotalLiters
                              ),
                              operationalCapacityLiters: Number(
                                tank.operationalCapacityLiters
                              ),
                              minimumStockLiters: Number(
                                tank.minimumStockLiters
                              ),
                              replenishmentLeadDays: tank.replenishmentLeadDays,
                              safetyReserveLiters: Number(
                                tank.safetyReserveLiters
                              ),
                              nearMinimumPercent: tank.nearMinimumPercent,
                              autonomyWarningDays: tank.autonomyWarningDays,
                              autonomyCriticalDays: tank.autonomyCriticalDays,
                              discrepancyAlertPercent: Number(
                                tank.discrepancyAlertPercent
                              ),
                              staleAfterDays: tank.staleAfterDays,
                              active: !tank.active,
                            });
                            await refresh();
                            toast.success(
                              tank.active
                                ? "Tanque inativado."
                                : "Tanque reativado."
                            );
                          } catch (error: any) {
                            toast.error(error.message);
                          }
                        }}
                      >
                        {tank.active ? "Inativar" : "Reativar"}
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {canManageTanks && (
          <div className="panel assignment-panel">
            <div className="section-title">
              <div>
                <h2>Vincular bicos a tanques</h2>
                <small>
                  O tanque precisa ter o mesmo combustível do bico. Uma origem
                  explícita é obrigatória para registrar saídas.
                </small>
              </div>
            </div>
            <div className="assignment-list">
              {pumps.isError ? (
                <QueryError retry={() => pumps.refetch()} />
              ) : (
                (pumps.data ?? []).map(pump => {
                  const assigned = tankRows
                    .flatMap(tank =>
                      tank.assignments.map(assignment => ({ tank, assignment }))
                    )
                    .find(row => row.assignment.pumpId === pump.id)?.tank;
                  return (
                    <div className="assignment-row" key={pump.id}>
                      <div>
                        <strong>{pump.number}</strong>
                        <small>
                          <FuelTypeBadge fuelType={pump.fuelType} />
                          {" · atual: "}
                          {assigned?.name ?? "sem tanque vinculado"}
                        </small>
                      </div>
                      <select
                        className="form-select"
                        value={assigned?.id ?? ""}
                        onChange={async event => {
                          if (!event.target.value) return;
                          try {
                            await assignPump.mutateAsync({
                              pumpId: pump.id,
                              tankId: Number(event.target.value),
                            });
                            await refresh();
                            toast.success(
                              `${pump.number} vinculado ao tanque.`
                            );
                          } catch (error: any) {
                            toast.error(error.message);
                          }
                        }}
                        disabled={assignPump.isPending}
                      >
                        <option value="">Selecionar tanque</option>
                        {tankRows
                          .filter(
                            tank =>
                              tank.active && tank.fuelType === pump.fuelType
                          )
                          .map(tank => (
                            <option key={tank.id} value={tank.id}>
                              {tank.name} · {fuelTypeLabel(tank.fuelType)}
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      <div className="stock-operations-grid">
        <section className="panel stock-section">
          <div className="section-title">
            <div>
              <h2>Registrar entrada</h2>
              <small>
                Fornecedor, nota fiscal, custo e comprovante são
                opcionais/obrigatórios conforme o campo.
              </small>
            </div>
            <ArrowDown size={18} />
          </div>
          <form className="stock-form-grid" onSubmit={submitReceipt}>
            <div className="field">
              <Label>Tanque de destino</Label>
              <select
                className="form-select"
                name="tankId"
                required
                defaultValue=""
                onChange={event => setReceiptTankId(event.target.value)}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {tankRows
                  .filter(tank => tank.active)
                  .map(tank => (
                    <option value={tank.id} key={tank.id}>
                      {tank.name} · {fuelTypeLabel(tank.fuelType)}
                    </option>
                  ))}
              </select>
              {selectedTankFuel(receiptTankId) && (
                <FuelTypeBadge fuelType={selectedTankFuel(receiptTankId)!} />
              )}
            </div>
            <div className="field">
              <Label>Fornecedor</Label>
              <Input name="supplier" required minLength={2} maxLength={180} />
            </div>
            <div className="field">
              <Label>Número da nota fiscal</Label>
              <Input name="invoiceNumber" maxLength={80} />
            </div>
            <div className="field">
              <Label>Data e horário</Label>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                required
              />
            </div>
            <div className="field">
              <Label>Quantidade recebida (L)</Label>
              <Input
                name="quantityLiters"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0.001"
                required
              />
            </div>
            <div className="field">
              <Label>Valor total (R$)</Label>
              <Input
                name="acquisitionValue"
                inputMode="decimal"
                placeholder="0,00"
                required
              />
            </div>
            <div className="field">
              <Label>Comprovante (PDF/JPG/PNG, até 10 MB)</Label>
              <Input
                name="document"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
              />
            </div>
            <div className="field stock-form-wide">
              <Label>Observações</Label>
              <textarea
                className="form-textarea"
                name="notes"
                maxLength={2000}
                rows={2}
              />
            </div>
            <div className="stock-form-actions">
              <Button
                className="primary-button"
                disabled={
                  createReceipt.isPending ||
                  requestUpload.isPending ||
                  attachDocument.isPending
                }
              >
                <Upload size={16} />
                {createReceipt.isPending ? "Registrando…" : "Registrar entrada"}
              </Button>
            </div>
          </form>
        </section>

        <section className="panel stock-section">
          <div className="section-title">
            <div>
              <h2>Registrar medição física</h2>
              <small>
                A leitura física fica em registro complementar; não substitui o
                estoque teórico.
              </small>
            </div>
            <Gauge size={18} />
          </div>
          <form className="stock-form-grid" onSubmit={submitMeasurement}>
            <div className="field">
              <Label>Tanque</Label>
              <select
                className="form-select"
                name="tankId"
                required
                defaultValue=""
                onChange={event => setMeasurementTankId(event.target.value)}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {tankRows
                  .filter(tank => tank.active)
                  .map(tank => (
                    <option value={tank.id} key={tank.id}>
                      {tank.name} · {fuelTypeLabel(tank.fuelType)}
                    </option>
                  ))}
              </select>
              {selectedTankFuel(measurementTankId) && (
                <FuelTypeBadge
                  fuelType={selectedTankFuel(measurementTankId)!}
                />
              )}
            </div>
            <div className="field">
              <Label>Volume físico (L)</Label>
              <Input
                name="physicalLiters"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                required
              />
            </div>
            <div className="field">
              <Label>Data e horário</Label>
              <Input
                name="measuredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                required
              />
            </div>
            <div className="field">
              <Label>Observações</Label>
              <Input name="notes" maxLength={2000} />
            </div>
            <div className="stock-form-actions">
              <Button
                className="primary-button"
                disabled={recordMeasurement.isPending}
              >
                <Save size={16} />
                {recordMeasurement.isPending
                  ? "Salvando…"
                  : "Registrar medição"}
              </Button>
            </div>
          </form>
        </section>

        <section className="panel stock-section">
          <div className="section-title">
            <div>
              <h2>Baixa extraordinária</h2>
              <small>
                Exige motivo e autorização gerencial; cada movimento fica
                auditado.
              </small>
            </div>
            <ArrowUp size={18} />
          </div>
          <form className="stock-form-grid" onSubmit={submitWriteoff}>
            <div className="field">
              <Label>Tanque</Label>
              <select
                className="form-select"
                name="tankId"
                required
                defaultValue=""
                onChange={event => setWriteoffTankId(event.target.value)}
              >
                <option value="" disabled>
                  Selecione
                </option>
                {tankRows
                  .filter(tank => tank.active)
                  .map(tank => (
                    <option value={tank.id} key={tank.id}>
                      {tank.name} · {fuelTypeLabel(tank.fuelType)}
                    </option>
                  ))}
              </select>
              {selectedTankFuel(writeoffTankId) && (
                <FuelTypeBadge fuelType={selectedTankFuel(writeoffTankId)!} />
              )}
            </div>
            <div className="field">
              <Label>Quantidade (L)</Label>
              <Input
                name="quantityLiters"
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                required
              />
            </div>
            <div className="field">
              <Label>Data e horário</Label>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                required
              />
            </div>
            <div className="field">
              <Label>Motivo documentado</Label>
              <Input name="reason" minLength={5} maxLength={1000} required />
            </div>
            <div className="stock-form-actions">
              <Button
                className="primary-button"
                disabled={recordWriteoff.isPending}
              >
                <CircleAlert size={16} />
                {recordWriteoff.isPending
                  ? "Registrando…"
                  : "Registrar baixa autorizada"}
              </Button>
            </div>
          </form>
        </section>
      </div>

      <section className="panel stock-section movement-report-section">
        <div className="section-title">
          <div>
            <h2>Histórico de movimentações e relatórios</h2>
            <small>
              Movimentos com saldo acumulado, responsável, documento e origem.
            </small>
          </div>
          <div className="heading-actions">
            <Button variant="outline" onClick={() => exportMovements("pdf")}>
              <Download size={15} /> PDF
            </Button>
            <Button variant="outline" onClick={() => exportMovements("xlsx")}>
              <FileSpreadsheet size={15} /> Excel
            </Button>
          </div>
        </div>
        <div className="filter-strip stock-filter-strip">
          <div className="field">
            <Label>De</Label>
            <Input
              type="date"
              value={filterFrom}
              onChange={event => setFilterFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <Label>Até</Label>
            <Input
              type="date"
              value={filterTo}
              onChange={event => setFilterTo(event.target.value)}
            />
          </div>
          <div className="field">
            <Label>Tanque</Label>
            <select
              className="form-select"
              value={filterTank}
              onChange={event => setFilterTank(event.target.value)}
            >
              <option value="">Todos</option>
              {tankRows.map(tank => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </select>
          </div>
          <FuelTypeFilter
            id="stock-fuel-filter"
            label="Combustível"
            value={filterFuel}
            onChange={setFilterFuel}
          />
          <div className="field">
            <Label>Movimentação</Label>
            <select
              className="form-select"
              value={filterType}
              onChange={event => setFilterType(event.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(movementNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {movements.isError ? (
          <QueryError retry={() => movements.refetch()} />
        ) : movements.isLoading ? (
          <div className="table-loading">Carregando movimentações…</div>
        ) : (movements.data ?? []).length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tanque / combustível</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Estoque resultante</th>
                  <th>Custo de aquisição</th>
                  <th>Custo/L</th>
                  <th>Responsável</th>
                  <th>Documento relacionado</th>
                </tr>
              </thead>
              <tbody>
                {(movements.data ?? []).map(row => (
                  <tr key={row.id}>
                    <td>{new Date(row.occurredAt).toLocaleString("pt-BR")}</td>
                    <td>
                      {row.tankName}
                      <small>
                        <FuelTypeBadge fuelType={row.fuelType} /> {row.tankCode}
                      </small>
                    </td>
                    <td>
                      {movementNames[row.movementType] ?? row.movementType}
                    </td>
                    <td
                      className={
                        Number(row.quantityLiters) < 0
                          ? "text-danger"
                          : "text-success"
                      }
                    >
                      {movementQuantity(row.quantityLiters)}
                    </td>
                    <td>{liters(row.balanceAfterLiters)}</td>
                    <td>
                      {row.movementType === "receipt" &&
                      row.acquisitionValueCents !== null
                        ? money(row.acquisitionValueCents)
                        : "—"}
                    </td>
                    <td>
                      {row.movementType === "receipt" &&
                      row.acquisitionValueCents !== null &&
                      Number(row.quantityLiters) > 0
                        ? `${money(Math.round(row.acquisitionValueCents / Number(row.quantityLiters)))}/L`
                        : "—"}
                    </td>
                    <td>{row.responsible}</td>
                    <td>
                      {row.documentKey ? (
                        <a
                          className="inline-link"
                          href={`/api/files/${row.documentKey}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Comprovante
                        </a>
                      ) : (
                        (row.invoiceNumber ??
                        (row.sourceClosureId
                          ? `Fechamento #${row.sourceClosureId}`
                          : "—"))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tank-empty">
            <Fuel size={21} />
            <strong>Nenhuma movimentação encontrada</strong>
            <span>
              Quando houver estoque inicial, entradas ou fechamentos, o
              histórico aparecerá aqui.
            </span>
          </div>
        )}
      </section>

      <section className="panel stock-section">
        <div className="section-title">
          <div>
            <h2>Medições físicas</h2>
            <small>Comparação registrada no momento da medição.</small>
          </div>
          <div className="heading-actions">
            <Button variant="outline" onClick={() => exportMeasurements("pdf")}>
              <Download size={15} /> PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportMeasurements("xlsx")}
            >
              <FileSpreadsheet size={15} /> Excel
            </Button>
          </div>
        </div>
        {measurements.isError ? (
          <QueryError retry={() => measurements.refetch()} />
        ) : measurements.isLoading ? (
          <div className="table-loading">Carregando medições…</div>
        ) : (measurements.data ?? []).length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tanque</th>
                  <th>Físico</th>
                  <th>Teórico no momento</th>
                  <th>Diferença</th>
                  <th>Responsável</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {(measurements.data ?? []).map(row => (
                  <tr key={row.measurement.id}>
                    <td>
                      {new Date(row.measurement.measuredAt).toLocaleString(
                        "pt-BR"
                      )}
                    </td>
                    <td>
                      {row.tankName}
                      <small>{row.tankCode}</small>
                    </td>
                    <td>{liters(row.measurement.physicalLiters)}</td>
                    <td>{liters(row.measurement.theoreticalLiters)}</td>
                    <td
                      className={
                        Number(row.measurement.differenceLiters) < 0
                          ? "text-danger"
                          : "text-success"
                      }
                    >
                      {movementQuantity(row.measurement.differenceLiters)}
                      {row.measurement.differencePercent !== null
                        ? ` (${Number(row.measurement.differencePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`
                        : ""}
                    </td>
                    <td>{row.measuredByName}</td>
                    <td>{row.measurement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tank-empty">
            Nenhuma medição física foi registrada.
          </div>
        )}
      </section>

      <section className="panel stock-note">
        <CircleAlert size={17} />
        <p>
          <strong>Planejamento de reposição não gera pedidos.</strong> A
          quantidade sugerida considera consumo médio real, estoque mínimo,
          prazo e reserva, limitada à capacidade operacional. A decisão final é
          do gerente ou administrador.
        </p>
      </section>
    </>
  );
}
