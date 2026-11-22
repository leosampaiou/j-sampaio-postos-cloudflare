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
    availableDays < MINIMUM_AUTONOMY_SAMPLE_DAYS
      ? `Previsão indisponível: amostra válida de ${availableDays} de ${MINIMUM_AUTONOMY_SAMPLE_DAYS} dias completos, cada um com manhã, tarde e noite, desde ${formatDate(sampleStartDate)}.`
      : `A média usa ${availableDays} dias completos; dias sem os três turnos foram excluídos da janela de ${windowDays} dias.`;

  return <p className="tank-data-quality">{message}</p>;
}
