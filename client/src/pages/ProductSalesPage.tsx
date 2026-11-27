import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import "./ProductSalesPage.css";
import { parseCurrencyCents } from "@shared/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QueryError from "@/components/QueryError";
import { toast } from "sonner";
import { Barcode, Camera, CameraOff, Check, CheckCircle2, CircleAlert, Clock3, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

type User = { id: number; fullName: string; role: "frentista" | "gerente" | "administrador" };
type Product = {
  id: number; barcode: string; name: string; brand: string | null; category: string | null;
  specification: string | null; priceCents: number; active: boolean;
  commissionMode?: "none" | "percent" | "fixed"; commissionValue?: number;
};
type CartLine = { product: Product; quantity: number };
const money = (cents: number) => ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shiftOptions = [{ value: "manha", label: "Manhã" }, { value: "tarde", label: "Tarde" }, { value: "noite", label: "Noite" }] as const;

function BarcodeScanner({ onCode, disabled = false, compact = false }: { onCode: (code: string) => void; disabled?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer = 0;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível neste navegador.");
        const Detector = (window as any).BarcodeDetector;
        if (!Detector) throw new Error("Leitura automática não é compatível neste navegador. Digite ou pesquise o código.");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return;
        const node = video.current;
        if (!node) return;
        node.srcObject = stream;
        await node.play();
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
        setStatus("Aponte a câmera para o código de barras.");
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            const result = await detector.detect(video.current);
            const code = result?.[0]?.rawValue;
            if (code) {
              stopped = true;
              onCodeRef.current(code);
              setOpen(false);
              return;
            }
          } catch { /* O próximo quadro tenta novamente. */ }
          if (!stopped) timer = window.setTimeout(() => void scan(), 250);
        };
        void scan();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível abrir a câmera.");
        setOpen(false);
        toast.error(error instanceof Error ? error.message : "Não foi possível abrir a câmera. Digite o código manualmente.");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [open]);
  return <div className="barcode-tools">
    <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(value => !value)}>
      {open ? <CameraOff size={17} /> : <Camera size={17} />}{open ? "Fechar câmera" : compact ? "Escanear" : "Ler com câmera"}
    </Button>
    {open && <div className="scanner-preview"><video ref={video} playsInline muted aria-label="Visualização da câmera para código de barras" /><p>{status || "Solicitando acesso à câmera…"}</p></div>}
  </div>;
}

function SaleRegister({ user }: { user: User }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [addedNotice, setAddedNotice] = useState("");
  const [confirmationUncertain, setConfirmationUncertain] = useState(false);
  const [receipt, setReceipt] = useState<{
    id: number;
    totalCents: number;
    repeated: boolean;
    date: string;
    shift: string;
    items: { name: string; quantity: number }[];
  } | null>(null);
  const key = useRef(crypto.randomUUID());
  const submittedDate = useRef<string | null>(null);
  const submitLock = useRef(false);
  const currentShift = trpc.products.currentShift.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const catalog = trpc.products.catalog.useQuery();
  const sale = trpc.products.createSale.useMutation({
    onSuccess: result => {
      setReceipt({
        id: result.id,
        totalCents: result.totalCents,
        repeated: result.repeated,
        date: submittedDate.current ?? currentShift.data?.date ?? "",
        shift: result.shift,
        items: cart.map(line => ({ name: line.product.name, quantity: line.quantity })),
      });
      setCart([]);
      setSearch("");
      setAddedNotice("");
      setConfirmationUncertain(false);
      key.current = crypto.randomUUID();
      void Promise.all([
        utils.products.slot.invalidate(),
        utils.products.report.invalidate(),
        utils.products.catalog.invalidate(),
      ]).catch(() => {
        toast.error(`Venda #${result.id} registrada, mas alguns dados não atualizaram. Recarregue a página.`);
      });
      toast.success(
        result.repeated
          ? `Venda #${result.id} já estava registrada. Nenhuma duplicação foi criada.`
          : `Venda #${result.id} registrada com sucesso.`
      );
    },
    onError: error => {
      const code = error.data?.code;
      const definitiveFailure = ["BAD_REQUEST", "FORBIDDEN", "CONFLICT"].includes(
        code ?? ""
      );
      const uncertain = !definitiveFailure;
      setConfirmationUncertain(uncertain);
      if (!uncertain) key.current = crypto.randomUUID();
      toast.error(
        uncertain
          ? "A confirmação não chegou. A venda pode ter sido registrada; mantenha este carrinho e tente confirmar novamente para evitar duplicação."
          : error.message
      );
    },
    onSettled: () => {
      submitLock.current = false;
    },
  });
  const locked = sale.isPending || confirmationUncertain;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return [];
    return (catalog.data ?? [])
      .filter(product =>
        `${product.name} ${product.brand ?? ""} ${product.barcode} ${product.category ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(term)
      )
      .slice(0, 8);
  }, [catalog.data, search]);
  const total = cart.reduce(
    (sum, line) => sum + line.product.priceCents * line.quantity,
    0
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const addProduct = (product: Product) => {
    const alreadyAdded = cart.some(line => line.product.id === product.id);
    setCart(current => {
      const existing = current.find(line => line.product.id === product.id);
      return existing
        ? current.map(line =>
            line.product.id === product.id
              ? { ...line, quantity: line.quantity + 1 }
              : line
          )
        : [...current, { product, quantity: 1 }];
    });
    setAddedNotice(
      alreadyAdded
        ? `Quantidade de ${product.name} atualizada no carrinho.`
        : `${product.name} adicionado ao carrinho.`
    );
    setReceipt(null);
    setSearch("");
  };
  const selectByCode = (code: string) => {
    if (locked) return;
    const product = catalog.data?.find(
      item => item.barcode === code && item.active
    );
    if (product) addProduct(product);
    else {
      setSearch(code);
      toast.error(
        "Código não encontrado em produtos ativos. Confira o código ou use a busca manual."
      );
    }
  };
  const handleSearchEnter = () => {
    const term = search.trim();
    if (!term) return;
    const exact = catalog.data?.find(
      product => product.barcode === term && product.active
    );
    const match = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (match) addProduct(match);
    else if (!filtered.length)
      toast.error("Nenhum produto encontrado. Confira o nome ou código.");
  };
  const submit = () => {
    if (submitLock.current || sale.isPending) return;
    if (!cart.length) return toast.error("Adicione ao menos um produto.");
    if (!currentShift.data) return toast.error("Aguardando a confirmação do horário oficial para identificar o turno.");
    submitLock.current = true;
    submittedDate.current = currentShift.data.date;
    setReceipt(null);
    sale.mutate({
      closureDate: currentShift.data.date,
      idempotencyKey: key.current,
      items: cart.map(line => ({
        productId: line.product.id,
        quantity: line.quantity,
      })),
    });
  };

  const sellerInitials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("pt-BR");
  const shiftLabel = shiftOptions.find(item => item.value === currentShift.data?.shift)?.label;
  const shiftDate = currentShift.data?.date
    ? new Date(`${currentShift.data.date}T12:00:00`).toLocaleDateString("pt-BR")
    : "";

  return (
    <section className="sale-flow-card">
      {receipt ? (
        <section
          className={`sale-success-screen ${receipt.repeated ? "sale-success-replayed" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="sale-success-mark"><CheckCircle2 size={34} /></div>
          <span className="sale-success-eyebrow">
            {receipt.repeated ? "CONFIRMAÇÃO RECUPERADA" : "VENDA REGISTRADA"}
          </span>
          <h2>{receipt.repeated ? "Esta venda já estava registrada" : "Venda concluída"}</h2>
          <p className="sale-success-meta">
            Venda #{receipt.id} · {new Date(`${receipt.date}T12:00:00`).toLocaleDateString("pt-BR")} · {shiftOptions.find(item => item.value === receipt.shift)?.label ?? "Turno"}
          </p>
          <p>
            {receipt.repeated
              ? "A venda já existia. Nenhuma duplicação foi criada."
              : "Venda registrada e vinculada ao fechamento do turno."}
          </p>
          <div className="sale-success-items">
            {receipt.items.map((item, index) => (
              <div key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <strong>{item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}</strong>
              </div>
            ))}
          </div>
          <div className="sale-success-total">
            <span>Total confirmado pelo servidor</span>
            <strong>{money(receipt.totalCents)}</strong>
          </div>
          <Button
            className="sale-new-button"
            onClick={() => {
              setReceipt(null);
              setCart([]);
              setSearch("");
              setAddedNotice("");
            }}
          >
            <Plus size={18} /> Registrar outra venda
          </Button>
        </section>
      ) : (
        <>
          <header className="sale-topbar">
            <div className="sale-seller">
              <span className="sale-seller-avatar">{sellerInitials}</span>
              <span>
                <small>Vendedor</small>
                <strong>{user.fullName}</strong>
              </span>
            </div>
            <div className={`sale-shift-chip ${currentShift.data?.shift === "manha" ? "morning" : "night"}`} role="status" aria-live="polite">
              <Clock3 size={19} />
              <span>
                <strong>{shiftLabel ?? (currentShift.isError ? "Turno indisponível" : "Identificando turno…")}</strong>
                <small>
                  {currentShift.data
                    ? `${shiftDate} · ${currentShift.data.time} · São Paulo`
                    : "Horário oficial"}
                </small>
              </span>
            </div>
          </header>

          {currentShift.isError && !currentShift.data && (
            <QueryError
              message="Não foi possível confirmar o turno pelo horário oficial. A venda ficará indisponível até a consulta voltar."
              retry={() => currentShift.refetch()}
            />
          )}
          {confirmationUncertain && (
            <div className="sale-feedback sale-feedback-warning" role="alert">
              <CircleAlert size={20} />
              <span>
                A confirmação não chegou. A venda pode ter sido registrada. Mantenha os mesmos itens e toque em “Tentar confirmar novamente” para verificar sem duplicar.
              </span>
            </div>
          )}
          {sale.isError && !confirmationUncertain && (
            <div className="sale-feedback sale-feedback-error" role="alert">
              <CircleAlert size={20} />
              <span>
                <strong>A venda não foi registrada.</strong>
                <small>{sale.error.message}</small>
              </span>
            </div>
          )}

          <div className="sale-workspace-grid">
            <section className="sale-entry-panel">
              <div className="sale-panel-heading">
                <span className="sale-panel-icon"><Barcode size={20} /></span>
                <span>
                  <h2>Adicionar produtos</h2>
                  <small>Pesquise ou escaneie o código de barras.</small>
                </span>
              </div>
              <div className="field sale-search-field">
                <Label htmlFor="product-search">Produto</Label>
                <div className="product-scan-row sale-search-row">
                  <Input
                    id="product-search"
                    value={search}
                    disabled={locked || catalog.isLoading}
                    onChange={event => {
                      setSearch(event.target.value);
                      setAddedNotice("");
                    }}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSearchEnter();
                      }
                    }}
                    placeholder="Nome, marca ou código"
                    autoComplete="off"
                  />
                  <BarcodeScanner onCode={selectByCode} disabled={locked} compact />
                </div>
                <small>Ex.: óleo 5W-30 ou os números do código.</small>
              </div>
              {addedNotice && (
                <div className="sale-added-message" role="status" aria-live="polite">
                  <CheckCircle2 size={17} /> {addedNotice}
                </div>
              )}

              {search.trim() ? (
                <div className="product-search-results" role="listbox" aria-label="Produtos encontrados">
                  {filtered.map(product => (
                    <button
                      type="button"
                      key={product.id}
                      role="option"
                      aria-selected="false"
                      disabled={locked}
                      onClick={() => addProduct(product)}
                    >
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.brand ? `${product.brand} · ` : ""}Código {product.barcode}</small>
                      </span>
                      <b>{money(product.priceCents)}</b>
                      <Plus size={18} />
                    </button>
                  ))}
                  {!filtered.length && (
                    <p>{catalog.isLoading ? "Carregando produtos…" : "Nenhum produto encontrado. Tente outro nome ou código."}</p>
                  )}
                </div>
              ) : (
                <div className="sale-search-hint">
                  <ShoppingCart size={20} />
                  <span>Os produtos adicionados aparecerão no resumo da venda.</span>
                </div>
              )}
              {catalog.isError && (
                <QueryError
                  message="Não foi possível carregar os produtos."
                  retry={() => catalog.refetch()}
                />
              )}
            </section>

            <section className="sale-order-panel" aria-label="Venda atual">
              <div className="sale-order-heading">
                <span>
                  <h2>Venda atual</h2>
                  <small>{itemCount} {itemCount === 1 ? "unidade" : "unidades"}</small>
                </span>
                <span className="sale-order-icon"><ShoppingCart size={19} /></span>
              </div>

              {cart.length ? (
                <div className="sale-order-items" aria-live="polite">
                  {cart.map(line => (
                    <div className="sale-order-item" key={line.product.id}>
                      <span className="sale-order-product">
                        <strong>{line.product.name}</strong>
                        <small>
                          {money(line.product.priceCents)} cada · subtotal {money(line.product.priceCents * line.quantity)}
                        </small>
                      </span>
                      <span className="sale-order-actions">
                        <span className="quantity-control">
                          <button
                            type="button"
                            disabled={locked}
                            aria-label={`Diminuir ${line.product.name}`}
                            onClick={() => setCart(current => current.flatMap(row =>
                              row.product.id !== line.product.id
                                ? [row]
                                : row.quantity > 1
                                  ? [{ ...row, quantity: row.quantity - 1 }]
                                  : []
                            ))}
                          >
                            <Minus size={15} />
                          </button>
                          <b>{line.quantity}</b>
                          <button
                            type="button"
                            disabled={locked}
                            aria-label={`Aumentar ${line.product.name}`}
                            onClick={() => setCart(current => current.map(row =>
                              row.product.id === line.product.id
                                ? { ...row, quantity: row.quantity + 1 }
                                : row
                            ))}
                          >
                            <Plus size={15} />
                          </button>
                        </span>
                        <button
                          className="sale-remove-item"
                          type="button"
                          disabled={locked}
                          aria-label={`Remover ${line.product.name}`}
                          onClick={() => setCart(current => current.filter(row => row.product.id !== line.product.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sale-empty-order">
                  <span><ShoppingCart size={25} /></span>
                  <strong>A venda começa por aqui</strong>
                  <small>Busque um produto ou escaneie o código para adicioná-lo.</small>
                </div>
              )}

              <div className="sale-order-footer">
                <div className="sale-order-total">
                  <span>Total da venda</span>
                  <strong>{money(total)}</strong>
                </div>
                <Button
                  className="sale-confirm-button"
                  disabled={sale.isPending || catalog.isLoading || !currentShift.data || (!cart.length && !confirmationUncertain)}
                  onClick={submit}
                >
                  <Check size={19} />
                  {sale.isPending
                    ? "Registrando venda…"
                    : confirmationUncertain
                      ? "Tentar confirmar novamente"
                      : cart.length ? "Confirmar venda" : "Adicione um produto"}
                </Button>
                <small>
                  {sale.isPending
                    ? "Aguarde a confirmação. Não toque novamente."
                    : "Registrada no turno e incluída no fechamento."}
                </small>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function CatalogManager() {
  const utils = trpc.useUtils();
  const query = trpc.products.list.useQuery();
  const commission = trpc.products.commissionStatus.useQuery();
  const [editing, setEditing] = useState<Product | null>(null);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [specification, setSpecification] = useState("");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<"none" | "percent" | "fixed">("none");
  const [commissionValue, setCommissionValue] = useState("");
  const [search, setSearch] = useState("");
  const utilsMutation = trpc.products.save.useMutation({ onSuccess: async () => { await Promise.all([utils.products.list.invalidate(), utils.products.catalog.invalidate()]); reset(); toast.success("Produto salvo no catálogo."); }, onError: error => toast.error(error.message) });
  const toggle = trpc.products.setActive.useMutation({ onSuccess: () => utils.products.list.invalidate(), onError: error => toast.error(error.message) });
  const setEnabled = trpc.products.setCommissionsEnabled.useMutation({ onSuccess: async () => { await utils.products.commissionStatus.invalidate(); toast.success("Configuração de comissão atualizada. Vendas passadas permanecem inalteradas."); }, onError: error => toast.error(error.message) });
  function reset() { setEditing(null); setBarcode(""); setName(""); setBrand(""); setCategory(""); setSpecification(""); setPrice(""); setMode("none"); setCommissionValue(""); }
  function edit(product: Product) { setEditing(product); setBarcode(product.barcode); setName(product.name); setBrand(product.brand ?? ""); setCategory(product.category ?? ""); setSpecification(product.specification ?? ""); setPrice((product.priceCents / 100).toFixed(2).replace(".", ",")); setMode(product.commissionMode ?? "none"); setCommissionValue(product.commissionMode === "percent" ? ((product.commissionValue ?? 0) / 100).toString().replace(".", ",") : product.commissionMode === "fixed" ? ((product.commissionValue ?? 0) / 100).toFixed(2).replace(".", ",") : ""); }
  function save(event: React.FormEvent) { event.preventDefault(); const priceCents = parseCurrencyCents(price); const raw = Number(commissionValue.replace(".", "").replace(",", ".")); if (priceCents === null) return toast.error("Informe um preço válido em reais."); if (mode !== "none" && (!Number.isFinite(raw) || raw < 0)) return toast.error("Informe um valor de comissão válido."); const value = mode === "percent" ? Math.round(raw * 100) : mode === "fixed" ? parseCurrencyCents(commissionValue) : 0; if (value === null) return toast.error("Informe uma comissão fixa válida."); utilsMutation.mutate({ id: editing?.id, barcode, name, brand: brand || null, category: category || null, specification: specification || null, priceCents, commissionMode: mode, commissionValue: value }); }
  const visible = (query.data ?? []).filter(item => `${item.name} ${item.brand ?? ""} ${item.barcode}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <div className="management-workspace product-management-workspace">
    <div className="panel commission-switch-panel"><div><span className="eyebrow">CONFIGURAÇÃO POR UNIDADE</span><h2>Comissões de produtos</h2><p>Começa desativada. Ao ativar, aplica-se às próximas vendas; snapshots antigos não são recalculados.</p></div><label className="switch-control"><input type="checkbox" checked={commission.data?.enabled ?? false} disabled={commission.isLoading || setEnabled.isPending} onChange={event => setEnabled.mutate({ enabled: event.target.checked })} /><span>{commission.data?.enabled ? "Ativada" : "Desativada"}</span></label></div>
    <section className="panel product-catalog-panel"><div className="product-section-heading"><div><span className="eyebrow">CADASTRO OPERACIONAL</span><h2>Catálogo por unidade</h2><p>O código de barras é texto, preservando zeros à esquerda. Produtos inativos ficam no histórico.</p></div><span className="product-count">{query.data?.length ?? 0} produtos</span></div>
      <form className="product-form" onSubmit={save}><div className="field"><Label htmlFor="product-barcode">Código de barras</Label><div className="product-scan-row"><Input id="product-barcode" value={barcode} onChange={event => setBarcode(event.target.value)} required maxLength={80} /><BarcodeScanner onCode={setBarcode} /></div></div><div className="field"><Label htmlFor="product-name">Nome</Label><Input id="product-name" value={name} onChange={event => setName(event.target.value)} required maxLength={160} /></div><div className="field"><Label htmlFor="product-brand">Marca</Label><Input id="product-brand" value={brand} onChange={event => setBrand(event.target.value)} maxLength={120} /></div><div className="field"><Label htmlFor="product-category">Categoria</Label><Input id="product-category" value={category} onChange={event => setCategory(event.target.value)} maxLength={120} /></div><div className="field"><Label htmlFor="product-specification">Especificação</Label><Input id="product-specification" value={specification} onChange={event => setSpecification(event.target.value)} maxLength={240} /></div><div className="field"><Label htmlFor="product-price">Preço de venda (R$)</Label><Input id="product-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="0,00" required /></div><div className="field"><Label htmlFor="product-commission-mode">Comissão por produto</Label><select id="product-commission-mode" className="form-select" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="none">Sem comissão</option><option value="percent">Percentual do preço</option><option value="fixed">Valor fixo por unidade</option></select></div>{mode !== "none" && <div className="field"><Label htmlFor="product-commission-value">{mode === "percent" ? "Percentual (%)" : "Comissão fixa (R$)"}</Label><Input id="product-commission-value" inputMode="decimal" value={commissionValue} onChange={event => setCommissionValue(event.target.value)} required /></div>}<div className="product-form-actions"><Button className="primary-button" disabled={utilsMutation.isPending}>{utilsMutation.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar produto"}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancelar edição</Button>}</div></form>
      <div className="field product-filter"><Label htmlFor="product-filter">Filtrar catálogo</Label><Input id="product-filter" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, marca ou código" /></div>
      {query.isError && <QueryError message="Não foi possível carregar o catálogo." retry={() => query.refetch()} />}
      <div className="table-scroll" role="region" aria-label="Catálogo de produtos" tabIndex={0}><table className="data-table"><thead><tr><th>Produto / código</th><th>Categoria</th><th>Preço</th><th>Comissão</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visible.map(product => <tr key={product.id}><td><strong>{product.name}</strong><small className="product-table-sub">{product.brand ? `${product.brand} · ` : ""}{product.barcode}</small></td><td>{product.category || product.specification || "—"}</td><td>{money(product.priceCents)}</td><td>{product.commissionMode === "percent" ? `${((product.commissionValue ?? 0) / 100).toLocaleString("pt-BR")}%` : product.commissionMode === "fixed" ? `${money(product.commissionValue ?? 0)} / un.` : "—"}</td><td><span className={`status-badge ${product.active ? "success" : "neutral"}`}>{product.active ? "Ativo" : "Inativo"}</span></td><td><div className="product-row-actions"><Button type="button" variant="outline" size="sm" onClick={() => edit(product)}>Editar</Button><Button type="button" variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: product.id, active: !product.active })}>{product.active ? "Inativar" : "Reativar"}</Button></div></td></tr>)}{!visible.length && <tr><td colSpan={6}>Nenhum produto corresponde ao filtro.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}

function CommissionReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = Boolean(from && to && from > to);
  const query = trpc.products.report.useQuery({ from: from || undefined, to: to || undefined }, { enabled: !invalid });
  const utils = trpc.useUtils();
  const cancel = trpc.products.cancel.useMutation({ onSuccess: async () => { await Promise.all([utils.products.report.invalidate(), utils.products.slot.invalidate()]); toast.success("Venda cancelada com justificativa e trilha de auditoria."); }, onError: error => toast.error(error.message) });
  const totalSales = query.data?.sellers.reduce((sum, seller) => sum + seller.salesCents, 0) ?? 0;
  const totalCommission = query.data?.sellers.reduce((sum, seller) => sum + seller.commissionCents, 0) ?? 0;
  return <div className="management-workspace commission-report-workspace"><div className="product-section-heading"><div><span className="eyebrow">ANÁLISE GERENCIAL</span><h2>Vendas e comissões por período</h2><p>Valores congelados em cada venda, agrupados pelo funcionário vinculado à conta no momento do registro.</p></div></div>
    <div className="filter-strip"><div className="field"><Label htmlFor="product-report-from">De</Label><Input id="product-report-from" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div><div className="field"><Label htmlFor="product-report-to">Até</Label><Input id="product-report-to" type="date" value={to} onChange={event => setTo(event.target.value)} /></div><span className="filter-count">{invalid ? "Período inválido" : query.isLoading ? "Carregando…" : `${query.data?.sellers.length ?? 0} vendedores`}</span></div>
    {invalid && <div className="inline-alert" role="alert">A data inicial não pode ser posterior à final.</div>}{query.isError && <QueryError message="Relatório indisponível." retry={() => query.refetch()} />}
    <div className="stats-grid report-stats"><article className="stat-card"><span>Vendas de produtos</span><strong>{query.isLoading || query.isError ? "—" : money(totalSales)}</strong></article><article className="stat-card stat-card-yellow"><span>Comissões registradas</span><strong>{query.isLoading || query.isError ? "—" : money(totalCommission)}</strong></article></div>
    <section className="panel"><div className="table-scroll" role="region" aria-label="Resumo de vendas e comissões por vendedor" tabIndex={0}><table className="data-table"><thead><tr><th>Vendedor</th><th>Unidades</th><th>Vendas</th><th>Comissões</th></tr></thead><tbody>{query.data?.sellers.map(seller => <tr key={seller.employeeId}><td>{seller.sellerName}</td><td>{seller.quantity}</td><td>{money(seller.salesCents)}</td><td>{money(seller.commissionCents)}</td></tr>)}{query.data?.sellers.length === 0 && <tr><td colSpan={4}>Nenhuma venda de produto no período.</td></tr>}</tbody></table></div></section>
    <section className="panel"><h3>Vendas registradas no período</h3><div className="table-scroll" role="region" aria-label="Itens de vendas de produtos" tabIndex={0}><table className="data-table"><thead><tr><th>Data / turno</th><th>Vendedor</th><th>Produto</th><th>Qtd.</th><th>Total</th><th>Comissão</th><th>Ação</th></tr></thead><tbody>{query.data?.sales.map((row, index) => <tr key={`${row.id}-${row.item.id}-${index}`}><td>{new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")} · {shiftOptions.find(item => item.value === row.shift)?.label}</td><td>{row.sellerName}</td><td><strong>{row.item.nameSnapshot}</strong><small className="product-table-sub">{row.item.barcodeSnapshot}</small></td><td>{row.item.quantity}</td><td>{money(row.item.totalCents)}</td><td>{money(row.commissionCents)}</td><td><Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => { const reason = window.prompt("Informe o motivo obrigatório do cancelamento (mínimo 5 caracteres):"); if (reason && reason.trim().length >= 5) cancel.mutate({ id: row.id, reason }); else if (reason !== null) toast.error("O motivo deve ter pelo menos 5 caracteres."); }}>Cancelar</Button></td></tr>)}{query.data?.sales.length === 0 && <tr><td colSpan={7}>Nenhuma venda registrada.</td></tr>}</tbody></table></div></section>
  </div>;
}

export default function ProductSalesPage({ user, management }: { user: User; management: boolean }) {
  return <div className="product-sales-workspace">
    {management && <div className="product-page-header"><div><span className="eyebrow">PRODUTOS · OPERAÇÃO E GESTÃO</span><h1>Produtos e comissões</h1><p>Catálogo por unidade, vendas com snapshots e consulta gerencial.</p></div><Link href="/registrar-venda" className="inline-link"><Barcode size={16} /> Abrir venda</Link></div>}
    {!management && <div className="product-page-header"><div><span className="eyebrow">VENDA RÁPIDA</span><h1>Nova venda</h1><p>Adicione os produtos, confira o total e finalize.</p></div></div>}
    <SaleRegister user={user} />
    {management && <><CatalogManager /><CommissionReport /></>}
  </div>;
}
