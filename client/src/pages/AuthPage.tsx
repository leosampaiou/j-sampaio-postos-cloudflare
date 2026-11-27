import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { storeCsrfToken } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export default function AuthPage({
  setupRequired,
}: {
  setupRequired: boolean;
}) {
  const [setupMode, setSetupMode] = useState(setupRequired);
  const [showPassword, setShowPassword] = useState(false);
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async result => {
      storeCsrfToken(result.csrfToken);
      await utils.auth.me.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const bootstrap = trpc.auth.bootstrap.useMutation({
    onSuccess: async result => {
      storeCsrfToken(result.csrfToken);
      await utils.auth.me.invalidate();
      toast.success("Administrador criado. Bem-vindo ao painel.");
    },
    onError: error => toast.error(error.message),
  });
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const busy = login.isPending || bootstrap.isPending;

  return (
    <main className="auth-page redesign-auth">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <img src="/logo-jsampaio.png" alt="J Sampaio Postos" />
        </div>
        <div className="auth-brand-copy">
          <span className="eyebrow">GESTÃO DE FECHAMENTOS</span>
          <h1>
            Fechamento claro.
            <br />
            <em>Operação sob controle.</em>
          </h1>
          <p>
            Um fluxo seguro para fechar turnos, conferir recebimentos e
            acompanhar o posto em tempo real.
          </p>
          <div className="auth-trust">
            <ShieldCheck size={18} /> Acesso individual e registros auditáveis
          </div>
        </div>
        <div className="auth-brand-foot">
          J SAMPAIO POSTOS <span>•</span> VARGEM GRANDE · MA
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-logo">
            <img src="/logo-jsampaio.png" alt="J Sampaio Postos" />
          </div>
          <span className="eyebrow">
            {setupMode ? "CONFIGURAÇÃO SEGURA" : "ÁREA RESTRITA"}
          </span>
          <h2>{setupMode ? "Criar administrador" : "Acesse sua conta"}</h2>
          <p className="muted">
            {setupMode
              ? "Use a chave de ativação entregue ao responsável pelo sistema. Ela será validada apenas no servidor."
              : "Entre com seu usuário individual para continuar."}
          </p>
          <form
            onSubmit={event => {
              event.preventDefault();
              if (setupMode)
                bootstrap.mutate({
                  activationKey,
                  username,
                  fullName,
                  password,
                });
              else login.mutate({ username, password });
            }}
            className="auth-form"
          >
            {setupMode && (
              <>
                <div className="field">
                  <Label htmlFor="admin-name">Nome completo</Label>
                  <Input
                    id="admin-name"
                    autoComplete="name"
                    value={fullName}
                    onChange={event => setFullName(event.target.value)}
                    required
                    minLength={2}
                    placeholder="Responsável pelo posto"
                  />
                </div>
                <div className="field">
                  <Label htmlFor="activation">Chave de ativação</Label>
                  <Input
                    id="activation"
                    type="password"
                    autoComplete="off"
                    value={activationKey}
                    onChange={event => setActivationKey(event.target.value)}
                    required
                    placeholder="Chave fornecida em configuração segura"
                  />
                </div>
              </>
            )}
            <div className="field">
              <Label htmlFor="username">Nome de usuário</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                required
                minLength={3}
                placeholder="Seu usuário"
              />
            </div>
            <div className="field">
              <Label htmlFor="password">Senha</Label>
              <div className="password-wrap">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={setupMode ? "new-password" : "current-password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={setupMode ? 12 : 1}
                  placeholder={
                    setupMode ? "Mínimo de 12 caracteres" : "Sua senha"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {setupMode && (
                <small>
                  Use pelo menos 12 caracteres. A senha não pode ser recuperada
                  por administradores.
                </small>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="auth-submit"
              aria-busy={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle
                    className="auth-submit-spinner"
                    size={17}
                    aria-hidden="true"
                  />
                  <span>
                    {setupMode ? "Criando administrador…" : "Entrando…"}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {setupMode ? "Criar primeiro administrador" : "Entrar"}
                  </span>
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
          {!setupRequired && (
            <p className="auth-security">
              <LockKeyhole size={15} /> Sessão protegida · acesso registrado
            </p>
          )}
          {setupRequired && (
            <p className="auth-security">
              <LockKeyhole size={15} /> O primeiro administrador é criado uma
              única vez, sem conta padrão.
            </p>
          )}
          {!setupRequired && setupMode && (
            <button
              type="button"
              className="text-button"
              onClick={() => setSetupMode(false)}
            >
              Voltar ao login
            </button>
          )}
        </div>
        <footer className="auth-copyright">
          © {new Date().getFullYear()} D ANDRADE SAMPAIO LTDA.
        </footer>
      </section>
    </main>
  );
}
