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
      ? `Previsão indisponível: não há dias completos com vendas válidas desde ${formatDate(sampleStartDate)}. Cada dia precisa dos fechamentos das 13h (manhã) e das 22h (noite).`
      : availableDays < MINIMUM_AUTONOMY_SAMPLE_DAYS
        ? `Estimativa exibida com baixa confiabilidade: baseada em ${availableDays} dia(s) completo(s), abaixo dos ${MINIMUM_AUTONOMY_SAMPLE_DAYS} dias recomendados. Cada dia precisa dos fechamentos das 13h (manhã) e das 22h (noite); foram considerados os dados desde ${formatDate(sampleStartDate)}.`
        : `Confiabilidade baixa: a média usa ${availableDays} dias completos com os fechamentos das 13h e 22h; dias sem ambos foram excluídos da janela de ${windowDays} dias.`;

  return <p className="tank-data-quality">{message}</p>;
}
