import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CircleAlert, Fuel, Gauge } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FuelTypeBadge } from "@/components/FuelType";

const liters = (value: number) =>
  `${Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L`;
const days = (value: number | null) =>
  value === null
    ? "Sem previsão"
    : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dias`;
const date = (value: string | null) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const healthLabel: Record<string, string> = {
  confortavel: "Estoque confortável",
  atencao: "Atenção",
  critico: "Estoque crítico",
};
export default function TankStockOverview() {
  const [windowDays, setWindowDays] = useState<7 | 15 | 30>(7);
  const query = trpc.inventory.dashboard.useQuery(
    { windowDays },
    { retry: false }
  );
  const data = query.data;
  const orderedTanks = [...(data?.tanks ?? [])].sort((first, second) => {
    const fuelPriority = (fuelType: string) =>
      fuelType === "gasolina_comum" ? 0 : fuelType === "diesel_s10" ? 1 : 2;
    return fuelPriority(first.fuelType) - fuelPriority(second.fuelType);
  });

  return (
    <section className="tank-overview" aria-labelledby="tank-overview-title">
      <div className="tank-overview-heading">
        <div>
          <span className="eyebrow">POSIÇÃO OPERACIONAL</span>
          <h2 id="tank-overview-title">ESTOQUE DOS TANQUES</h2>
          <p>
            Estoque teórico atualizado e projeções baseadas em fechamentos
            reais.
          </p>
        </div>
        <div className="tank-overview-actions">
          <label htmlFor="tank-window">Média de consumo</label>
          <select
            id="tank-window"
            className="select-control"
            value={windowDays}
            onChange={event =>
              setWindowDays(Number(event.target.value) as 7 | 15 | 30)
            }
          >
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
          </select>
          <Link href="/estoque" className="inline-link">
            Detalhes <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      {query.isLoading ? (
        <div className="panel tank-empty">Carregando estoque dos tanques…</div>
      ) : query.error ? (
        <div className="panel tank-empty">
          <CircleAlert size={19} />
          <strong>Não foi possível consultar o estoque.</strong>
          <span>
            Atualize a página ou acesse Estoque e Tanques para verificar.
          </span>
        </div>
      ) : !data?.configured ? (
        <div className="panel tank-empty">
          <div className="empty-icon">
            <Fuel size={21} />
          </div>
          <strong>Estoque ainda não configurado</strong>
          <span>
            Cadastre os tanques e vincule os bicos para exibir quantidades e
            previsões reais. Nenhum valor estimado foi inventado.
          </span>
          <Link href="/estoque" className="quick-primary">
            Configurar estoque <ArrowRight size={15} />
          </Link>
        </div>
      ) : !data.tanks.length ? (
        <div className="panel tank-empty">
          <strong>Nenhum tanque ativo</strong>
          <span>
            Tanques inativos permanecem no histórico e podem ser reativados na
            administração.
          </span>
          <Link href="/estoque" className="inline-link">
            Gerenciar tanques <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="tank-card-grid dashboard-tank-card-grid">
          {orderedTanks.map(tank => (
            <article
              key={tank.id}
              className={`panel tank-card health-${tank.stockHealth}`}
            >
              <div className="tank-card-top">
                <div>
                  <span className="tank-code">{tank.code}</span>
                  <h3>{tank.name}</h3>
                  <FuelTypeBadge fuelType={tank.fuelType} />
                </div>
                <span
                  className={`tank-health-badge health-${tank.stockHealth}`}
                >
                  {healthLabel[tank.stockHealth] ?? "Situação desconhecida"}
                </span>
              </div>
              <div className="tank-primary-stock">
                <strong>{liters(tank.stockLiters)}</strong>
                <span>
                  disponíveis · capacidade total{" "}
                  {liters(Number(tank.capacityTotalLiters))}
                </span>
              </div>
              <div
                className="tank-progress-track"
                role="meter"
                aria-label={`Ocupação do tanque ${tank.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(tank.occupiedPercent)}
              >
                <span
                  className={`tank-progress-value health-${tank.stockHealth}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, tank.occupiedPercent))}%`,
                  }}
                />
              </div>
              <div className="tank-progress-label">
                <span>
                  {tank.occupiedPercent.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}
                  % da capacidade operacional
                </span>
                <span>{liters(Number(tank.operationalCapacityLiters))}</span>
              </div>
              <div className="tank-key-metrics">
                <div>
                  <span>
                    <Gauge size={14} /> Autonomia
                  </span>
                  <strong>{days(tank.autonomyDays)}</strong>
                </div>
                <div>
                  <span>Média diária ({windowDays}d)</span>
                  <strong>
                    {tank.averageDailyLiters > 0
                      ? `${liters(tank.averageDailyLiters)}/dia`
                      : "Sem média"}
                  </strong>
                </div>
                <div>
                  <span>Previsão de esgotamento</span>
                  <strong>
                    {tank.expectedEmptyDate
                      ? date(tank.expectedEmptyDate)
                      : "Sem previsão"}
                  </strong>
                </div>
                <div>
                  <span>Reposição sugerida</span>
                  <strong>
                    {tank.suggestedReplenishmentLiters > 0
                      ? liters(tank.suggestedReplenishmentLiters)
                      : "Sem pedido sugerido"}
                  </strong>
                </div>
              </div>
              {tank.dataQuality === "baixa" && (
                <p className="tank-data-quality">
                  Histórico insuficiente para uma previsão confiável nesta
                  janela.
                </p>
              )}
              {tank.latestMeasurement && (
                <p className="tank-measurement-note">
                  Última medição física:{" "}
                  {liters(Number(tank.latestMeasurement.physicalLiters))} em{" "}
                  {new Date(tank.latestMeasurement.measuredAt).toLocaleString(
                    "pt-BR"
                  )}{" "}
                  · não substitui o estoque teórico.
                </p>
              )}
              {tank.alerts.length > 0 && (
                <ul className="tank-alert-list">
                  {tank.alerts.map(alert => (
                    <li key={alert.code} className={alert.severity}>
                      <CircleAlert size={14} />
                      {alert.message}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/estoque" className="tank-detail-link">
                Abrir detalhes do tanque <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
