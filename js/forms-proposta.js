// =====================================================================
// Formulário de criar/editar proposta
// =====================================================================
import { getProposta, saveProposta, getLojasStatus, vincularLeadAProposta, getLead, deleteProposta, getArquivos, deleteArquivo } from './data-layer.js';
import { abrirModal, campo, lojasPicker } from './modal.js';
import { el, REF_RSM } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';
import { extrairPropostaDoPDF } from './claude.js';
import { uploadArquivo, getArquivoUrl } from './upload.js';

export async function abrirFormProposta(id = null, opts = {}) {
  let dados = {};
  if (id) dados = await getProposta(id);
  // Se veio de um Lead, pré-preenche
  if (opts?.preenchimento) {
    dados = { ...dados, ...opts.preenchimento };
  }

  const lojasStatus = await getLojasStatus();
  const body = el('div');

  // Painel "Contexto do lead" — só quando vem de conversão lead→proposta
  if (opts && opts.fromLead) {
    try {
      const leadCtx = await getLead(opts.fromLead);
      if (leadCtx) {
        const painelLead = el('div');
        painelLead.style.cssText = 'background:#eff6ff;border-left:4px solid #2563eb;padding:14px 16px;border-radius:6px;margin-bottom:18px;font-size:13px';
        const dias = leadCtx.created_at
          ? Math.floor((Date.now() - new Date(leadCtx.created_at)) / 86400000)
          : null;
        const ultDias = leadCtx.ultima_interacao_data
          ? Math.floor((Date.now() - new Date(leadCtx.ultima_interacao_data)) / 86400000)
          : null;
        const tempoStr = ultDias === null ? '—' : ultDias === 0 ? 'hoje' : ultDias === 1 ? 'há 1 dia' : ('há ' + ultDias + ' dias');
        const notas = leadCtx.observacoes
          ? '<div style="margin-top:8px;padding:8px 10px;background:#fff;border-radius:4px;font-size:12px;color:var(--ink);white-space:pre-wrap;max-height:120px;overflow:auto"><strong style="color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Notas internas do lead</strong>' + leadCtx.observacoes + '</div>'
          : '';
        painelLead.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">📋</span><strong style="color:#1e40af">Originado do Lead — ' + (leadCtx.cliente_nome || '?') + '</strong></div>' +
          '<div style="color:#475569;font-size:12px">' +
            (dias !== null ? 'Em pipeline há ' + dias + ' dias' : '') +
            (leadCtx.corretor ? ' · Corretor: <strong>' + leadCtx.corretor + '</strong>' : '') +
            ' · Última interação: <strong>' + tempoStr + '</strong>' +
            ' · ' + (leadCtx.qtd_interacoes || 0) + ' interação(ões)' +
          '</div>' +
          notas +
          '<div style="margin-top:8px;font-size:11px;color:#64748b;font-style:italic">As notas do lead ficam apenas aqui — não vão para a proposta. Preencha os campos abaixo com o que o cliente realmente propôs.</div>';
        body.appendChild(painelLead);
      }
    } catch (e) { console.warn('Não foi possível carregar contexto do lead:', e); }
  }

  // Cliente e ramo
  const sec1 = el('div', { className: 'form-section' });
  sec1.appendChild(el('div', { className: 'form-section-title' }, 'Cliente e contexto'));
  const grid1 = el('div', { className: 'form-grid' });
  grid1.appendChild(campo({ name:'cliente_nome', label:'Cliente (nome)', type:'text', value:dados.cliente_nome, required:true, full:true }));
  grid1.appendChild(campo({ name:'ramo', label:'Ramo de atividade', type:'text', value:dados.ramo, full:true, placeholder:'Ex: Cafeteria, Pet shop, Estúdio fitness' }));
  grid1.appendChild(campo({ name:'corretor', label:'Corretor', type:'text', value:dados.corretor || 'Biensky Imóveis' }));
  grid1.appendChild(campo({ name:'cv', label:'CV / referência', type:'text', value:dados.cv, placeholder:'#11667' }));
  grid1.appendChild(campo({ name:'data_proposta', label:'Data da proposta', type:'date', value:dados.data_proposta ? toIso(dados.data_proposta) : new Date().toISOString().slice(0,10), required:true }));
  grid1.appendChild(campo({
    name:'status', label:'Status', type:'select',
    options:[
      { value:'em_analise', label:'Em análise' },
      { value:'aceita_aguardando_docs', label:'Aceita — aguardando documentação' },
      { value:'recusada', label:'Recusada' },
      { value:'expirada', label:'Expirada' }
    ],
    value: dados.status || 'em_analise'
  }));
  sec1.appendChild(grid1);
  body.appendChild(sec1);

  // Lojas
  const sec2 = el('div', { className:'form-section' });
  sec2.appendChild(el('div', { className:'form-section-title' }, 'Lojas envolvidas'));
  const picker = lojasPicker({
    lojasStatus,
    selecionadas: dados.lojas || [],
    permitirOcupadas: false,
    onChange: function(lojasSel, areaTotal) {
      const inpArea = body.querySelector('[name="area_total"]');
      if (inpArea && !inpArea.dataset.userEdited && areaTotal > 0) {
        inpArea.value = areaTotal;
      }
      atualizarRsM2();
    }
  });
  sec2.appendChild(picker.el);
  body.appendChild(sec2);

  // Termos comerciais
  const sec3 = el('div', { className:'form-section' });
  sec3.appendChild(el('div', { className:'form-section-title' }, 'Termos comerciais'));
  const grid3 = el('div', { className:'form-grid cols-3' });
  // Área: usa o que veio em dados, senão calcula das lojas selecionadas
  let areaInicial = dados.area_total;
  if (!areaInicial && picker.getAreaTotal) {
    const a = picker.getAreaTotal();
    if (a > 0) areaInicial = a;
  }
  grid3.appendChild(campo({ name:'area_total', label:'Área total (m²)', type:'number', value: areaInicial || '', hint:'Calculado das lojas selecionadas. Edite se a proposta usar área diferente.' }));
  grid3.appendChild(campo({ name:'valor_aluguel', label:'Aluguel mensal (R$)', type:'number', value:dados.valor_aluguel, required:true }));
  grid3.appendChild(campo({ name:'meses_carencia', label:'Carência (meses)', type:'number', value:dados.meses_carencia ?? 4 }));
  grid3.appendChild(campo({ name:'prazo_opcoes', label:'Prazo', type:'text', value:dados.prazo_opcoes || '5 anos', hint:'Ex: "5 anos" ou "3 ou 5 anos (a definir)"' }));
  grid3.appendChild(campo({
    name:'tipo_garantia', label:'Tipo de garantia', type:'select',
    options:[
      { value:'fianca_pj',            label:'Fiança PJ' },
      { value:'fianca_pessoal',       label:'Fiança Pessoal' },
      { value:'seguro_fianca',        label:'Seguro Fiança' },
      { value:'titulo_capitalizacao', label:'Título de Capitalização' },
      { value:'sem_garantia',         label:'Sem garantia' }
    ],
    value:dados.tipo_garantia || 'fianca_pessoal'
  }));
  grid3.appendChild(campo({ name:'detalhes_garantia', label:'Detalhes garantia', type:'text', value:dados.detalhes_garantia, placeholder:'Ex: Fiadores · ou nome da seguradora' }));
  sec3.appendChild(grid3);
  body.appendChild(sec3);

  // Indicador R$/m² ao vivo
  const rsm2Box = el('div');
  rsm2Box.style.cssText = 'margin:-6px 0 18px;padding:10px 14px;background:#f8fafc;border:1px solid var(--line);border-radius:6px;font-size:13px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  rsm2Box.innerHTML = '<span style="color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:0.04em">R$/m²</span>' +
    '<span data-rsm2-valor style="font-weight:700;font-size:18px;color:var(--ink-soft)">—</span>' +
    '<span data-rsm2-badge></span>' +
    '<span style="margin-left:auto;font-size:11px;color:var(--ink-soft)">Refs: conservador R$ 152 · médio R$ 176 · âncora R$ 193</span>';
  body.appendChild(rsm2Box);

  function atualizarRsM2() {
    const inpArea = body.querySelector('[name="area_total"]');
    const inpVal = body.querySelector('[name="valor_aluguel"]');
    const a = Number((inpArea && inpArea.value) || 0);
    const v = Number((inpVal && inpVal.value) || 0);
    const valorEl = rsm2Box.querySelector('[data-rsm2-valor]');
    const badgeEl = rsm2Box.querySelector('[data-rsm2-badge]');
    if (!a || !v) {
      valorEl.textContent = '—';
      valorEl.style.color = 'var(--ink-soft)';
      badgeEl.innerHTML = '';
      return;
    }
    const rsm2 = v / a;
    valorEl.textContent = 'R$ ' + rsm2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let label, bg, color;
    if (rsm2 >= REF_RSM.medio) {
      label = '✓ Dentro do médio (R$ ' + REF_RSM.medio.toFixed(0) + ')';
      bg = '#dcfce7'; color = '#15803d';
    } else if (rsm2 >= REF_RSM.conservador) {
      label = '⚠ Abaixo do médio, acima do conservador';
      bg = '#fef9c3'; color = '#a16207';
    } else {
      label = '⚠ Abaixo do conservador (R$ ' + REF_RSM.conservador.toFixed(0) + ')';
      bg = '#fee2e2'; color = '#b91c1c';
    }
    valorEl.style.color = color;
    badgeEl.innerHTML = '<span style="background:' + bg + ';color:' + color + ';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600">' + label + '</span>';
  }

  // Observações
  const sec4 = el('div', { className:'form-section' });
  sec4.appendChild(campo({ name:'observacoes', label:'Observações da proposta', type:'textarea', value:dados.observacoes, full:true, rows:3, hint:'Apenas o que o cliente formalizou na proposta. Anotações internas do lead ficam no próprio lead.' }));
  body.appendChild(sec4);

  // ===== DOCUMENTOS PARA ANÁLISE (só ao editar proposta existente) =====
  // Cliente que teve proposta aprovada envia documentos cadastrais; corretor anexa pra análise
  if (id) {
    const secDocsProp = el('div', { className: 'form-section' });
    secDocsProp.appendChild(el('div', { className: 'form-section-title' }, '📎 Documentos para análise do proponente'));
    secDocsProp.appendChild(el('div', {
      style: { fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '10px' }
    }, 'Anexe aqui os documentos enviados pelo cliente (cadastro, comprovantes, garantias, fiador) para análise antes de fechar o contrato.'));
    const arqListProp = el('div');
    secDocsProp.appendChild(arqListProp);

    const LABELS_CAT_PROP = {
      documentos_pessoais: 'Documentos do proponente',
      comprovante: 'Comprovantes',
      fianca: 'Documentos garantia/fiador',
      termo: 'Termos',
      laudo: 'Laudos',
      outro: 'Outros'
    };

    async function renderArqsProp() {
      try {
        const arquivos = await getArquivos('proposta', id);
        arqListProp.innerHTML = '';
        if (!arquivos || arquivos.length === 0) {
          arqListProp.innerHTML = '<div style="padding:14px;background:#f8fafc;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--ink-soft);font-size:13px">Nenhum documento anexado ainda. Use o botão abaixo para adicionar.</div>';
          return;
        }
        arquivos.forEach(function(a) {
          const row = el('div');
          row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px';
          const tamanho = a.tamanho_bytes ? (a.tamanho_bytes / 1024).toFixed(1) + ' KB' : '';
          const tituloCat = LABELS_CAT_PROP[a.categoria] || (a.categoria || 'Documento');
          row.innerHTML =
            '<span style="font-size:20px">📋</span>' +
            '<div style="min-width:0"><div style="font-weight:600;color:var(--ink)">' + tituloCat + '</div>' +
              '<div style="font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.nome_original || '?') + (tamanho ? ' · ' + tamanho : '') + '</div></div>' +
            '<button type="button" class="btn outline sm" data-ver-prop style="font-size:11px;padding:5px 10px">👁 Ver</button>' +
            '<label class="btn ghost sm" style="font-size:11px;padding:5px 10px;cursor:pointer;margin:0">📎 Substituir<input type="file" data-substituir-prop accept="application/pdf,image/jpeg,image/png" style="display:none"></label>' +
            '<button type="button" class="btn ghost sm" data-excluir-prop style="font-size:11px;padding:5px 10px;color:#dc2626" title="Excluir documento">🗑</button>';
          row.querySelector('[data-ver-prop]').addEventListener('click', async function() {
            try {
              const url = await getArquivoUrl(a.storage_path);
              if (url) window.open(url, '_blank');
              else mostrarToast('Arquivo não encontrado', 'error');
            } catch (err) {
              mostrarToast('Erro: ' + err.message, 'error');
            }
          });
          row.querySelector('[data-substituir-prop]').addEventListener('change', async function(ev) {
            const f = ev.target.files && ev.target.files[0];
            if (!f) return;
            try {
              await uploadArquivo(f, { entidade_tipo: 'proposta', entidade_id: id, categoria: a.categoria || 'outro' });
              mostrarToast('Arquivo enviado. O anterior fica como histórico.', 'success');
              await renderArqsProp();
            } catch (err) {
              mostrarToast('Erro ao substituir: ' + err.message, 'error');
            }
          });
          row.querySelector('[data-excluir-prop]').addEventListener('click', async function() {
            if (!confirm('Excluir definitivamente o documento "' + (a.nome_original || tituloCat) + '"?\n\nEsta acao nao pode ser desfeita.')) return;
            try {
              await deleteArquivo(a.id, a.storage_path);
              mostrarToast('Documento excluido', 'success');
              await renderArqsProp();
            } catch (err) {
              mostrarToast('Erro ao excluir: ' + err.message, 'error');
            }
          });
          arqListProp.appendChild(row);
        });
      } catch (err) {
        console.error('Erro ao carregar documentos:', err);
        arqListProp.innerHTML = '<div style="padding:14px;color:#991b1b;font-size:12px">Falha ao carregar documentos: ' + err.message + '</div>';
      }
    }

    // Botão "+ Anexar documento"
    const addBoxProp = el('div');
    addBoxProp.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const selCatProp = el('select');
    selCatProp.style.cssText = 'padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px';
    [
      { v: 'documentos_pessoais', l: 'Documentos do proponente' },
      { v: 'comprovante',         l: 'Comprovantes' },
      { v: 'fianca',              l: 'Documentos garantia/fiador' },
      { v: 'outro',               l: 'Outros' }
    ].forEach(function(o) {
      const op = el('option', { value: o.v }, o.l);
      selCatProp.appendChild(op);
    });
    const inpNovoProp = el('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png', style: 'display:none' });
    const inpIdProp = 'inp-novo-arq-prop-' + id;
    inpNovoProp.id = inpIdProp;
    const lblNovoProp = el('label', { className: 'btn outline sm', style: 'font-size:11px;padding:5px 10px;cursor:pointer;margin:0' }, '+ Anexar documento');
    lblNovoProp.htmlFor = inpIdProp;
    addBoxProp.appendChild(selCatProp);
    addBoxProp.appendChild(lblNovoProp);
    addBoxProp.appendChild(inpNovoProp);
    secDocsProp.appendChild(addBoxProp);

    inpNovoProp.addEventListener('change', async function(ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        await uploadArquivo(f, { entidade_tipo: 'proposta', entidade_id: id, categoria: selCatProp.value });
        mostrarToast('Documento anexado', 'success');
        inpNovoProp.value = '';
        await renderArqsProp();
      } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
      }
    });

    body.appendChild(secDocsProp);
    renderArqsProp();
  }

  // Zona de perigo (só em edição) — Excluir proposta
  if (id) {
    const secDanger = el('div');
    secDanger.style.cssText = 'margin-top:24px;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px';
    secDanger.innerHTML =
      '<div style="font-weight:600;color:#991b1b;margin-bottom:6px">⚠️ Excluir proposta</div>' +
      '<div style="font-size:12px;color:#7f1d1d;margin-bottom:10px">Se houver lead vinculado, ele volta para o status que você escolher. A proposta será apagada permanentemente.</div>';
    const linhaDel = el('div');
    linhaDel.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    // Seletor de "voltar lead pra qual status?"
    const selStatus = el('select');
    selStatus.style.cssText = 'padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px';
    const opcoes = [
      { v: 'interessado', l: 'Interessado' },
      { v: 'visitou',     l: 'Visitou' },
      { v: 'em_analise',  l: 'Em análise' }
    ];
    opcoes.forEach(function(o) {
      const op = el('option', { value: o.v }, 'Voltar lead pra: ' + o.l);
      selStatus.appendChild(op);
    });
    const btnDel = el('button', { type: 'button' }, '🗑 Excluir proposta');
    btnDel.style.cssText = 'padding:8px 14px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600';
    btnDel.addEventListener('click', async function() {
      const confirmacao = confirm('Tem certeza que deseja excluir esta proposta?\n\nSe houver lead vinculado, ele voltará para o status "' + selStatus.options[selStatus.selectedIndex].text.replace('Voltar lead pra: ','') + '".\n\nEsta ação NÃO pode ser desfeita.');
      if (!confirmacao) return;
      btnDel.disabled = true;
      btnDel.textContent = 'Excluindo...';
      try {
        await deleteProposta(id, { reverterParaStatus: selStatus.value });
        mostrarToast('Proposta excluída. Lead retomado.', 'success');
        const { fecharModal } = await import('./modal.js');
        fecharModal();
        await renderTudo();
      } catch (err) {
        mostrarToast('Erro ao excluir: ' + err.message, 'error');
        btnDel.disabled = false;
        btnDel.textContent = '🗑 Excluir proposta';
      }
    });
    linhaDel.appendChild(selStatus);
    linhaDel.appendChild(btnDel);
    secDanger.appendChild(linhaDel);
    body.appendChild(secDanger);
  }

  // Listeners pra recalcular R$/m² em tempo real
  setTimeout(function() {
    const inpArea = body.querySelector('[name="area_total"]');
    const inpVal = body.querySelector('[name="valor_aluguel"]');
    if (inpArea) inpArea.addEventListener('input', function() { inpArea.dataset.userEdited = '1'; atualizarRsM2(); });
    if (inpVal) inpVal.addEventListener('input', atualizarRsM2);
    atualizarRsM2();
  }, 50);

  // Upload OPCIONAL de proposta em PDF — Claude lê e preenche (somente em propostas NOVAS)
  if (!id) {
    const sec5 = el('div', { className: 'form-section' });
    sec5.appendChild(el('div', { className: 'form-section-title' }, 'Anexar proposta em PDF (opcional)'));
    const uploadBox = el('div', { className: 'upload-box', id: 'upload-proposta-box' });
    uploadBox.innerHTML =
      '<input type="file" name="proposta_pdf" id="proposta_pdf" accept="application/pdf" style="display:none">' +
      '<label for="proposta_pdf" style="cursor:pointer;display:block">' +
      '📎 Clique para anexar o PDF da proposta<br>' +
      '<span style="font-size:11px;color:var(--ink-soft)">O Claude vai ler e preencher os campos automaticamente.</span>' +
      '</label>';
    sec5.appendChild(uploadBox);
    const arquivoInfo = el('div', { className: 'arquivo-item', style: { display: 'none' } });
    sec5.appendChild(arquivoInfo);
    const iaStatus = el('div', {
      style: { display: 'none', marginTop: '10px', padding: '10px', borderRadius: '6px', fontSize: '12px' }
    });
    sec5.appendChild(iaStatus);
    body.appendChild(sec5);

    setTimeout(() => {
      const inp = document.getElementById('proposta_pdf');
      if (!inp) return;
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0];
        if (!f) return;

        arquivoInfo.innerHTML = '✓ <strong>' + f.name + '</strong> · ' + (f.size/1024).toFixed(1) + ' KB';
        arquivoInfo.style.display = 'block';
        uploadBox.style.borderColor = 'var(--green)';
        uploadBox.style.color = 'var(--green)';

        iaStatus.style.display = 'block';
        iaStatus.style.background = '#eff6ff';
        iaStatus.style.color = '#1e40af';
        iaStatus.style.border = '1px solid #bfdbfe';
        iaStatus.innerHTML = '🤖 Claude está lendo a proposta...';

        try {
          const extraido = await extrairPropostaDoPDF(f);
          preencherProposta(body, extraido, picker);
          const c = extraido.confianca ?? '?';
          iaStatus.style.background = '#ecfdf5';
          iaStatus.style.color = '#065f46';
          iaStatus.style.border = '1px solid #6ee7b7';
          iaStatus.innerHTML = '✓ Claude preencheu os campos (confiança ' + c + '/100). Revise antes de salvar.';
          mostrarToast('Proposta lida com IA - revise os campos', 'success');
        } catch (err) {
          console.error('Erro extração IA proposta:', err);
          iaStatus.style.background = '#fef2f2';
          iaStatus.style.color = '#991b1b';
          iaStatus.style.border = '1px solid #fecaca';
          iaStatus.innerHTML = '⚠️ Auto-preenchimento falhou: ' + err.message + '<br><span style="font-size:11px;opacity:0.8">Preencha manualmente.</span>';
        }
      });
    }, 100);
  }

  abrirModal({
    titulo: id ? 'Editar proposta' : 'Nova proposta',
    body,
    submitLabel: id ? 'Salvar alterações' : 'Criar proposta',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const input = {
        id,
        cliente_nome: fd.get('cliente_nome'),
        ramo: fd.get('ramo'),
        corretor: fd.get('corretor'),
        cv: fd.get('cv'),
        data_proposta: fd.get('data_proposta'),
        status: fd.get('status'),
        area_total: Number(fd.get('area_total')) || null,
        valor_aluguel: Number(fd.get('valor_aluguel')),
        meses_carencia: Number(fd.get('meses_carencia')) || null,
        prazo_opcoes: fd.get('prazo_opcoes'),
        tipo_garantia: fd.get('tipo_garantia'),
        detalhes_garantia: fd.get('detalhes_garantia'),
        observacoes: fd.get('observacoes'),
        lojas: picker.getSelected()
      };
      if (!input.cliente_nome) throw new Error('Informe o nome do cliente');
      if (input.lojas.length === 0) throw new Error('Selecione pelo menos uma loja');
      if (!input.valor_aluguel || input.valor_aluguel <= 0) throw new Error('Informe o valor do aluguel');
      if (!input.data_proposta) throw new Error('Informe a data da proposta');
      const propostaSalva = await saveProposta(input);
      // Se veio de um Lead, vincula o lead à proposta criada
      if (!id && opts?.fromLead && propostaSalva?.id) {
        try {
          await vincularLeadAProposta(opts.fromLead, propostaSalva.id);
        } catch (e) { console.warn('Falha ao vincular lead:', e); }
      }
      mostrarToast(id ? 'Proposta atualizada' : 'Proposta criada');
      await renderTudo();
    }
  });
}

function toIso(brStr) {
  if (!brStr) return '';
  if (brStr.includes('/')) {
    const [d,m,y] = brStr.split('/');
    return y + '-' + m + '-' + d;
  }
  return brStr;
}

// =====================================================================
// Preenche campos do formulário de proposta com dados extraídos do PDF
// =====================================================================
function preencherProposta(body, dados, picker) {
  if (!dados) return;
  const set = (name, value) => {
    if (value === null || value === undefined || value === '') return;
    const inp = body.querySelector('[name="' + name + '"]');
    if (!inp) return;
    inp.value = value;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };

  set('cliente_nome', dados.cliente_nome);
  set('ramo', dados.ramo);
  set('corretor', dados.corretor);
  set('cv', dados.cv);
  if (dados.data_proposta) set('data_proposta', toIso(dados.data_proposta));
  set('valor_aluguel', dados.valor_aluguel);
  set('meses_carencia', dados.meses_carencia);
  set('prazo_opcoes', dados.prazo_opcoes);
  set('tipo_garantia', dados.tipo_garantia);
  set('detalhes_garantia', dados.detalhes_garantia);
  set('observacoes', dados.observacoes);
}

