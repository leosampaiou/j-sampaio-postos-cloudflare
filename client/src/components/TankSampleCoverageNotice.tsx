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
      ? `Previsão indisponível: há ${availableDays} de ${MINIMUM_AUTONOMY_SAMPLE_DAYS} dias completos necessários. Cada dia precisa dos fechamentos das 13h (manhã) e das 22h (noite), desde ${formatDate(sampleStartDate)}.`
      : `A média usa ${availableDays} dias completos com os fechamentos das 13h e 22h; dias sem ambos foram excluídos da janela de ${windowDays} dias.`;

  return <p className="tank-data-quality">{message}</p>;
}
