import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type QueryErrorProps = {
  message?: string;
  retry?: () => unknown;
};

export default function QueryError({
  message = "Os dados não foram apagados. Verifique a conexão e tente novamente.",
  retry,
}: QueryErrorProps) {
  return (
    <div className="query-error-state" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
      <div className="query-error-copy">
        <strong>Não foi possível carregar os dados.</strong>
        <span>{message}</span>
      </div>
      {retry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void Promise.resolve(retry()).catch(() => undefined);
          }}
        >
          <RefreshCw size={15} /> Tentar novamente
        </Button>
      )}
    </div>
  );
}
