import { MINIMUM_AUTONOMY_SAMPLE_DAYS } from "@shared/inventory";

type TankSampleCoverageNoticeProps = {
  availableDays: number;
  windowDays: number;
  sampleStartDate: string;
};

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

export default function TankSampleCoverageNotice({
  availableDays,
  windowDays,
  sampleStartDate,
}: TankSampleCoverageNoticeProps) {
  const message =
    availableDays === 0
      ? `Previsão indisponível: não há dias com fechamentos finalizados e vendas válidas para este tanque desde ${formatDate(sampleStartDate)}.`
      : availableDays < MINIMUM_AUTONOMY_SAMPLE_DAYS
        ? `Estimativa exibida com baixa confiabilidade: usa os fechamentos válidos de ${availableDays} dia(s), abaixo dos ${MINIMUM_AUTONOMY_SAMPLE_DAYS} dias recomendados. São somados todos os fechamentos finalizados de qualquer turno; dias sem fechamento válido não entram na média.`
        : `Confiabilidade baixa: a média soma todos os fechamentos válidos de ${availableDays} dia(s) na janela de ${windowDays} dias; dias sem fechamento válido foram excluídos. Os turnos e a quantidade de fechamentos podem variar por dia.`;

  return <p className="tank-data-quality">{message}</p>;
}
