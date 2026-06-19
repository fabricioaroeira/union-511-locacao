// =====================================================================
// Formulário de criar/editar contrato
// =====================================================================
import { getContrato, saveContrato, getInquilinos, getLojasStatus, getProposta, saveInquilino,
         getDocumentosByContrato, saveDocumento, deleteDocumento, TIPOS_DOCUMENTO, getArquivos, deleteArquivo,
         getGestoesPorContrato, atualizarGestaoAtivo, marcarGestaoExecutada } from './data-layer.js';
import { abrirModal, campo, lojasPicker , confirmarAcao} from './modal.js';
import { el, fmtBR, parseBR } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';
import { extrairContratoDoPDF, extrairDocumentoDoPDF } from './claude.js';
import { uploadArquivo, getArquivoUrl } from './upload.js';

export async function abrirFormContrato(id = null, opts = {}) {
  let dados = {};

  if (id) dados = await getContrato(id);

  if (opts.fromProposta) {
    const p = await getProposta(opts.fromProposta);
    if (p) {
      dados = {
        valor_aluguel: p.valor_aluguel,
        meses_carencia: p.meses_carencia,
        tipo_garantia: p.tipo_garantia,
        detalhes_garantia: p.detalhes_garantia,
        lojas: p.lojas,
        observacoes: 'Convertido da proposta de ' + p.data_proposta + ' - Cliente: ' + p.cliente_nome + '. ' + (p.observacoes || ''),
        _propostaId: opts.fromProposta
      };
    }
  }

  const [inquilinos, lojasStatus] = await Promise.all([getInquilinos(), getLojasStatus()]);
  const body = el('div');
  body._novoInquilino = null;

  // Inquilino
  const sec1 = el('div', { className: 'form-section' });
  sec1.appendChild(el('div', { className: 'form-section-title' }, 'Inquilino'));
  const inqOptions = [
    { value: '', label: '- Selecione -' },
    ...inquilinos.map(i => ({ value: i.id, label: (i.nome_fantasia ? i.nome_fantasia + ' - ' : '') + i.razao_social + ' (' + i.documento + ')' }))
  ];
  const inqGrid = el('div', { className: 'form-grid' });
  inqGrid.appendChild(campo({ name: 'inquilino_id', label: 'Inquilino', type: 'select', options: inqOptions, value: dados.inquilino_id || '', required: true, full: true }));
  sec1.appendChild(inqGrid);
  body.appendChild(sec1);

  // Lojas
  const sec2 = el('div', { className: 'form-section' });
  sec2.appendChild(el('div', { className: 'form-section-title' }, 'Lojas'));
  const areaIndicador = el('div');
  areaIndicador.style.cssText = 'font-size:12px;color:var(--ink-soft);margin-top:6px';
  const picker = lojasPicker({
    lojasStatus,
    selecionadas: dados.lojas || [],
    permitirOcupadas: !!id,
    onChange: function(lojasSel, areaTotal) {
      areaIndicador.innerHTML = areaTotal > 0
        ? '<strong style="color:var(--ink)">' + areaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' m²</strong> calculado a partir das lojas selecionadas'
        : '';
    }
  });
  sec2.appendChild(picker.el);
  sec2.appendChild(areaIndicador);
  setTimeout(function() {
    var a = picker.getAreaTotal ? picker.getAreaTotal() : 0;
    if (a > 0) areaIndicador.innerHTML = '<strong style="color:var(--ink)">' + a.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' m²</strong> calculado a partir das lojas selecionadas';
  }, 50);
  body.appendChild(sec2);

  // Preço e prazo
  const sec3 = el('div', { className: 'form-section' });
  sec3.appendChild(el('div', { className: 'form-section-title' }, 'Preço, prazo e datas'));
  const grid3 = el('div', { className: 'form-grid cols-3' });
  grid3.appendChild(campo({ name: 'valor_aluguel', label: 'Valor mensal (R$)', type: 'number', value: dados.valor_aluguel, required: true }));
  grid3.appendChild(campo({ name: 'dia_vencimento', label: 'Dia vencimento', type: 'number', value: dados.dia_vencimento || 1, required: true }));
  grid3.appendChild(campo({ name: 'meses_carencia', label: 'Carência (meses)', type: 'number', value: dados.meses_carencia ?? 3 }));
  grid3.appendChild(campo({ name: 'data_assinatura', label: 'Data de assinatura', type: 'date', value: dados.data_assinatura ? toIso(dados.data_assinatura) : '', required: true }));
  grid3.appendChild(campo({ name: 'data_inicio', label: 'Início da vigência', type: 'date', value: dados.data_inicio ? toIso(dados.data_inicio) : '', required: true }));
  grid3.appendChild(campo({ name: 'prazo_meses', label: 'Prazo (meses)', type: 'number', value: dados.prazo_meses || 60, required: true }));
  sec3.appendChild(grid3);
  body.appendChild(sec3);

  // Reajuste e garantia
  const sec4 = el('div', { className: 'form-section' });
  sec4.appendChild(el('div', { className: 'form-section-title' }, 'Reajuste e garantia'));
  const grid4 = el('div', { className: 'form-grid' });
  grid4.appendChild(campo({
    name: 'indice_reajuste', label: 'Índice de reajuste', type: 'select',
    options: [
      { value: 'IGP-M', label: 'IGP-M/FGV' },
      { value: 'IPCA', label: 'IPCA' },
      { value: 'INPC', label: 'INPC' },
      { value: 'outro', label: 'Outro' }
    ],
    value: dados.indice_reajuste || 'IGP-M'
  }));
  grid4.appendChild(campo({
    name: 'tipo_garantia', label: 'Tipo de garantia', type: 'select',
    options: [
      { value: 'fianca_pj', label: 'Fiança PJ' },
      { value: 'fianca_pessoal', label: 'Fiança Pessoal' },
      { value: 'seguro_fianca', label: 'Seguro Fiança' },
      { value: 'titulo_capitalizacao', label: 'Título de Capitalização' },
      { value: 'sem_garantia', label: 'Sem garantia' }
    ],
    value: dados.tipo_garantia || 'fianca_pessoal',
    required: true
  }));
  grid4.appendChild(campo({ name: 'detalhes_garantia', label: 'Detalhes da garantia', type: 'textarea', value: dados.detalhes_garantia, full: true }));
  sec4.appendChild(grid4);
  body.appendChild(sec4);

  // Especiais
  const sec5 = el('div', { className: 'form-section' });
  sec5.appendChild(el('div', { className: 'form-section-title' }, 'Especiais'));
  const grid5 = el('div', { className: 'form-grid' });
  const parcialCampo = el('div', { className: 'form-field full' });
  parcialCampo.innerHTML = '<label><input type="checkbox" name="parcial" ' + (dados.parcial ? 'checked' : '') + '> Loja parcial / com vagas</label>';
  grid5.appendChild(parcialCampo);
  grid5.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', value: dados.observacoes, full: true, rows: 4 }));
  sec5.appendChild(grid5);
  body.appendChild(sec5);

  // === ARQUIVOS DO CONTRATO (PDF assinado, aditivos) — modo edição ===
  if (id) {
    const secArq = el('div', { className: 'form-section' });
    secArq.appendChild(el('div', { className: 'form-section-title' }, '📄 Arquivos do contrato'));
    secArq.appendChild(el('div', {
      style: { fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '10px' }
    }, 'PDF do contrato assinado, aditivos e outros arquivos relacionados ao contrato.'));
    const arqList = el('div');
    secArq.appendChild(arqList);

    async function renderArquivos() {
      try {
        const arquivos = await getArquivos('contrato', id);
        arqList.innerHTML = '';
        if (!arquivos || arquivos.length === 0) {
          arqList.innerHTML = '<div style="padding:14px;background:#f8fafc;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--ink-soft);font-size:13px">Nenhum arquivo anexado a este contrato.</div>';
          return;
        }
        arquivos.forEach(function(a) {
          const row = el('div');
          row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px';
          const tamanho = a.tamanho_bytes ? (a.tamanho_bytes / 1024).toFixed(1) + ' KB' : '';
          const LABELS_CAT = { contrato_assinado: 'Contrato', aditivo: 'Aditivos contratuais', termo: 'Termos', laudo: 'Laudos', fianca: 'Documentos garantia', documentos_pessoais: 'Documentos pessoais', comprovante: 'Comprovante', planta: 'Planta', outro: 'Outros' };
          const tituloCat = LABELS_CAT[a.categoria] || (a.categoria || 'Arquivo');
          row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px';
          row.innerHTML =
            '<span style="font-size:20px">📄</span>' +
            '<div style="min-width:0"><div style="font-weight:600;color:var(--ink)">' + tituloCat + '</div>' +
              '<div style="font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.nome_original || '?') + (tamanho ? ' · ' + tamanho : '') + '</div></div>' +
            '<button type="button" class="btn outline sm" data-ver style="font-size:11px;padding:5px 10px">👁 Ver</button>' +
            '<label class="btn ghost sm" style="font-size:11px;padding:5px 10px;cursor:pointer;margin:0">📎 Substituir<input type="file" data-substituir accept="application/pdf" style="display:none"></label>' +
            '<button type="button" class="btn ghost sm" data-excluir style="font-size:11px;padding:5px 10px;color:#dc2626" title="Excluir arquivo">🗑</button>';
          row.querySelector('[data-ver]').addEventListener('click', async function() {
            try {
              const url = await getArquivoUrl(a.storage_path);
              if (url) window.open(url, '_blank');
              else mostrarToast('Arquivo não encontrado', 'error');
            } catch (err) {
              mostrarToast('Erro: ' + err.message, 'error');
            }
          });
          row.querySelector('[data-substituir]').addEventListener('change', async function(ev) {
            const f = ev.target.files && ev.target.files[0];
            if (!f) return;
            try {
              const novo = await uploadArquivo(f, {
                entidade_tipo: 'contrato',
                entidade_id: id,
                categoria: a.categoria || 'outro'
              });
              // Não deleto o antigo (mantém histórico). Apenas mostra que tem o novo.
              mostrarToast('Arquivo enviado. O anterior fica como histórico.', 'success');
              await renderArquivos();
            } catch (err) {
              mostrarToast('Erro ao substituir: ' + err.message, 'error');
            }
          });
          row.querySelector('[data-excluir]').addEventListener('click', async function() {
            if (!(await confirmarAcao({ titulo: 'Excluir arquivo', mensagem: 'Excluir definitivamente o arquivo "' + (a.nome_original || tituloCat) + '"?\n\nEsta ação não pode ser desfeita.', confirmLabel: 'Excluir', perigo: true }))) return;
            try {
              await deleteArquivo(a.id, a.storage_path);
              mostrarToast('Arquivo excluido', 'success');
              await renderArquivos();
            } catch (err) {
              mostrarToast('Erro ao excluir: ' + err.message, 'error');
            }
          });
          arqList.appendChild(row);
        });
      } catch (err) {
        console.error('Erro ao carregar arquivos:', err);
        arqList.innerHTML = '<div style="padding:14px;color:#991b1b;font-size:12px">Falha ao carregar arquivos: ' + err.message + '</div>';
      }
    }

    // Botão "+ Anexar novo arquivo" (ex: aditivo)
    const addBox = el('div');
    addBox.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const selCat = el('select');
    selCat.style.cssText = 'padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px';
    [
      { v: 'contrato_assinado',   l: 'Contrato' },
      { v: 'aditivo',             l: 'Aditivos contratuais' },
      { v: 'termo',               l: 'Termos' },
      { v: 'laudo',               l: 'Laudos' },
      { v: 'fianca',              l: 'Documentos garantia' },
      { v: 'documentos_pessoais', l: 'Documentos pessoais' },
      { v: 'outro',               l: 'Outros' }
    ].forEach(function(o) {
      const op = el('option', { value: o.v }, o.l);
      selCat.appendChild(op);
    });
    const inpNovo = el('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png', style: 'display:none' });
    const inpId = 'inp-novo-arq-' + id;
    inpNovo.id = inpId;
    const lblNovo = el('label', { className: 'btn outline sm', style: 'font-size:11px;padding:5px 10px;cursor:pointer;margin:0' }, '+ Anexar novo arquivo');
    lblNovo.htmlFor = inpId;
    addBox.appendChild(selCat);
    addBox.appendChild(lblNovo);
    addBox.appendChild(inpNovo);
    secArq.appendChild(addBox);

    inpNovo.addEventListener('change', async function(ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        await uploadArquivo(f, {
          entidade_tipo: 'contrato',
          entidade_id: id,
          categoria: selCat.value
        });
        mostrarToast('Arquivo anexado', 'success');
        inpNovo.value = '';
        await renderArquivos();
      } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
      }
    });

    body.appendChild(secArq);
    renderArquivos();
  }

  // Documentos do contrato (só ao editar contrato existente — precisa do id pra vincular)
  if (id) {
    const secDocs = el('div', { className: 'form-section' });
    secDocs.appendChild(el('div', { className: 'form-section-title' }, 'Documentos do contrato (seguros, certidões, AVCB)'));
    secDocs.appendChild(el('div', {
      style: { fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '10px' }
    }, 'Cadastre documentos com data de validade para receber alertas automáticos antes do vencimento.'));
    const docsContainer = el('div', { id: 'docs-list-' + id });
    secDocs.appendChild(docsContainer);
    const btnAdd = el('button', { type: 'button', className: 'btn outline sm' }, '+ Adicionar documento');
    btnAdd.style.marginTop = '10px';
    const formContainer = el('div', { style: { display: 'none', marginTop: '12px' } });
    secDocs.appendChild(btnAdd);
    secDocs.appendChild(formContainer);

    const recarregar = async () => {
      const docs = await getDocumentosByContrato(id);
      renderDocsList(docs, docsContainer, mostrarForm);
    };

    function mostrarForm(docEdit) {
      btnAdd.style.display = 'none';
      formContainer.style.display = 'block';
      formContainer.innerHTML = '';
      formContainer.appendChild(renderDocForm(id, docEdit || null, async () => {
        formContainer.innerHTML = '';
        formContainer.style.display = 'none';
        btnAdd.style.display = 'inline-block';
        await recarregar();
      }));
    }

    btnAdd.addEventListener('click', () => mostrarForm(null));
    body.appendChild(secDocs);
    recarregar().catch(err => console.error('Erro ao carregar documentos:', err));
  }

  // Upload OBRIGATÓRIO de contrato assinado (somente em contratos NOVOS)
  const isNovo = !id;
  if (isNovo) {
    const sec6 = el('div', { className: 'form-section' });
    sec6.appendChild(el('div', { className: 'form-section-title' }, opts.fromProposta ? 'Contrato assinado (obrigatório para converter a proposta)' : 'Contrato assinado (obrigatório)'));
    const uploadBox = el('div', { className: 'upload-box', id: 'upload-contrato-box' });
    uploadBox.innerHTML =
      '<input type="file" name="contrato_pdf" id="contrato_pdf" accept="application/pdf" style="display:none">' +
      '<label for="contrato_pdf" style="cursor:pointer;display:block">' +
      '📎 Clique para anexar o PDF do contrato assinado<br>' +
      '<span style="font-size:11px;color:var(--ink-soft)">Apenas PDF. Ao anexar, o Claude lê o Quadro Resumo e preenche os campos automaticamente.</span>' +
      '</label>';
    sec6.appendChild(uploadBox);
    const arquivoInfo = el('div', { className: 'arquivo-item', style: { display: 'none' } });
    sec6.appendChild(arquivoInfo);
    const iaStatus = el('div', {
      style: { display: 'none', marginTop: '10px', padding: '10px', borderRadius: '6px', fontSize: '12px' }
    });
    sec6.appendChild(iaStatus);
    body.appendChild(sec6);

    setTimeout(() => {
      const inp = document.getElementById('contrato_pdf');
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
        iaStatus.innerHTML = '🤖 Claude está lendo o Quadro Resumo do contrato...';
        try {
          const extraido = await extrairContratoDoPDF(f);
          const novoInquilinoData = preencherCamposComExtracao(body, extraido, picker, inquilinos);
          const c = extraido.confianca ?? '?';
          iaStatus.style.background = '#ecfdf5';
          iaStatus.style.color = '#065f46';
          iaStatus.style.border = '1px solid #6ee7b7';
          let msg = '✓ Claude preencheu os campos (confiança ' + c + '/100). Revise antes de salvar.';
          if (novoInquilinoData) {
            msg += '<br><strong>Inquilino "' + (novoInquilinoData.nome_fantasia || novoInquilinoData.razao_social) + '" será criado automaticamente ao salvar.</strong>';
          }
          iaStatus.innerHTML = msg;
          mostrarToast('Contrato lido com IA - revise os campos', 'success');
        } catch (err) {
          console.error('Erro extração IA:', err);
          iaStatus.style.background = '#fef2f2';
          iaStatus.style.color = '#991b1b';
          iaStatus.style.border = '1px solid #fecaca';
          iaStatus.innerHTML = '⚠️ Auto-preenchimento falhou: ' + err.message;
        }
      });
    }, 100);
  }

  // ============================================================
  // Sistema de abas (só ao editar contrato existente)
  // Aba 1: Dados do contrato (form atual)
  // Aba 2: Gestões (itens gestionáveis do contrato)
  // ============================================================
  if (id) {
    const childrenAtuais = Array.from(body.children);
    const panelDados = el('div');
    childrenAtuais.forEach(c => panelDados.appendChild(c));

    const panelGestoes = el('div');
    panelGestoes.style.display = 'none';
    panelGestoes.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft);font-size:13px">⏳ Carregando gestões...</div>';

    const tabBar = el('div', { className: 'contrato-tabs' });
    const btnAbaDados = el('button', { type: 'button', className: 'contrato-tab active' }, 'Dados do contrato');
    const btnAbaGestoes = el('button', { type: 'button', className: 'contrato-tab' });
    btnAbaGestoes.innerHTML = 'Gestões<span class="badge" data-gestoes-count>·</span>';
    tabBar.appendChild(btnAbaDados);
    tabBar.appendChild(btnAbaGestoes);

    body.innerHTML = '';
    body.appendChild(tabBar);
    body.appendChild(panelDados);
    body.appendChild(panelGestoes);

    btnAbaDados.addEventListener('click', () => {
      btnAbaDados.classList.add('active');
      btnAbaGestoes.classList.remove('active');
      panelDados.style.display = '';
      panelGestoes.style.display = 'none';
    });

    let gestoesCarregadas = false;
    btnAbaGestoes.addEventListener('click', async () => {
      btnAbaGestoes.classList.add('active');
      btnAbaDados.classList.remove('active');
      panelDados.style.display = 'none';
      panelGestoes.style.display = '';
      if (!gestoesCarregadas) {
        gestoesCarregadas = true;
        try {
          const gestoes = await getGestoesPorContrato(id);
          renderGestoesPainel(gestoes, panelGestoes, btnAbaGestoes, id);
        } catch (err) {
          panelGestoes.innerHTML = '<div style="padding:20px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:13px">⚠️ Erro ao carregar gestões: ' + err.message + '</div>';
        }
      }
    });

    // Pré-carrega contagem de gestões pro badge da aba
    getGestoesPorContrato(id).then(gs => {
      const c = btnAbaGestoes.querySelector('[data-gestoes-count]');
      if (c) c.textContent = String((gs || []).filter(g => g.ativo).length);
    }).catch(() => {});
  }

  abrirModal({
    titulo: id ? 'Editar contrato' : (opts.fromProposta ? 'Converter proposta em contrato' : 'Novo contrato'),
    body,
    submitLabel: id ? 'Salvar alterações' : (opts.fromProposta ? 'Converter e arquivar PDF' : 'Criar contrato'),
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      let pdfFile = null;
      if (!id) {
        const inp = document.getElementById('contrato_pdf');
        pdfFile = inp?.files?.[0];
        if (!pdfFile) throw new Error('Anexe o PDF do contrato assinado antes de prosseguir.');
        if (pdfFile.type !== 'application/pdf') throw new Error('O arquivo precisa ser um PDF.');
      }
      let inquilinoId = fd.get('inquilino_id');
      if (inquilinoId === '__NOVO__' && body._novoInquilino) {
        const inqCriado = await saveInquilino(body._novoInquilino);
        if (!inqCriado?.id) throw new Error('Falha ao criar inquilino automaticamente');
        inquilinoId = inqCriado.id;
        mostrarToast('Inquilino "' + (inqCriado.nome_fantasia || inqCriado.razao_social) + '" criado', 'success');
      }
      const input = {
        id,
        inquilino_id: inquilinoId,
        valor_aluguel: Number(fd.get('valor_aluguel')),
        dia_vencimento: Number(fd.get('dia_vencimento')),
        meses_carencia: Number(fd.get('meses_carencia')),
        data_assinatura: fd.get('data_assinatura'),
        data_inicio: fd.get('data_inicio'),
        prazo_meses: Number(fd.get('prazo_meses')),
        indice_reajuste: fd.get('indice_reajuste'),
        tipo_garantia: fd.get('tipo_garantia'),
        detalhes_garantia: fd.get('detalhes_garantia'),
        parcial: !!fd.get('parcial'),
        observacoes: fd.get('observacoes'),
        lojas: picker.getSelected()
      };
      if (!input.inquilino_id || input.inquilino_id === '__NOVO__') {
        throw new Error('Selecione um inquilino existente ou anexe um PDF para criar um novo');
      }
      if (input.lojas.length === 0) throw new Error('Selecione pelo menos uma loja');
      if (!input.valor_aluguel || input.valor_aluguel <= 0) throw new Error('Informe o valor do aluguel');
      if (!input.data_assinatura) throw new Error('Informe a data de assinatura');
      if (!input.data_inicio) throw new Error('Informe a data de início da vigência');
      if (!input.prazo_meses || input.prazo_meses <= 0) throw new Error('Informe o prazo do contrato');

      const contrato = await saveContrato(input);

      if (pdfFile && contrato?.id) {
        try {
          const { uploadArquivo } = await import('./upload.js');
          await uploadArquivo(pdfFile, {
            entidade_tipo: 'contrato',
            entidade_id: contrato.id,
            categoria: 'contrato_assinado'
          });
        } catch (err) {
          console.error('Upload do PDF falhou:', err);
          mostrarToast('Contrato criado, mas falha no upload: ' + err.message, 'error');
        }
      }
      if (dados._propostaId) {
        const { saveProposta } = await import('./data-layer.js');
        await saveProposta({
          id: dados._propostaId,
          status: 'convertida_em_contrato',
          contrato_id: contrato.id,
          data_decisao: new Date().toISOString().slice(0,10)
        });
      }
      mostrarToast(id ? 'Contrato atualizado' : 'Contrato criado e PDF arquivado');
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

function preencherCamposComExtracao(body, dados, picker, inquilinos) {
  if (!dados) return null;
  let novoInquilinoData = null;
  const set = (name, value) => {
    if (value === null || value === undefined || value === '') return;
    const inp = body.querySelector('[name="' + name + '"]');
    if (!inp) return;
    if (inp.type === 'checkbox') {
      inp.checked = !!value;
    } else {
      inp.value = value;
    }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (dados.inquilino_documento || dados.inquilino_razao_social) {
    const docLimpo = (dados.inquilino_documento || '').replace(/\D/g, '');
    const razaoBusca = (dados.inquilino_razao_social || '').toLowerCase().trim();
    const match = inquilinos.find(i => {
      const idDoc = (i.documento || '').replace(/\D/g, '');
      const idRazao = (i.razao_social || '').toLowerCase().trim();
      return (docLimpo && idDoc === docLimpo) || (razaoBusca && idRazao.includes(razaoBusca));
    });
    if (match) {
      set('inquilino_id', match.id);
    } else if (dados.inquilino_razao_social) {
      const sel = body.querySelector('[name="inquilino_id"]');
      if (sel) {
        const labelNovo = '✨ Criar novo: ' + (dados.inquilino_nome_fantasia || dados.inquilino_razao_social) + (dados.inquilino_documento ? ' (' + dados.inquilino_documento + ')' : '');
        const opt = document.createElement('option');
        opt.value = '__NOVO__';
        opt.textContent = labelNovo;
        sel.appendChild(opt);
        sel.value = '__NOVO__';
      }
      const docLimpoNovo = (dados.inquilino_documento || '').replace(/\D/g, '');
      const tipoInferido = docLimpoNovo.length === 11 ? 'PF' : 'PJ';
      novoInquilinoData = {
        tipo: tipoInferido,
        razao_social: dados.inquilino_razao_social,
        nome_fantasia: dados.inquilino_nome_fantasia || null,
        documento: dados.inquilino_documento || 'SEM DOCUMENTO',
        segmento: dados.segmento_inquilino || null,
        email: dados.email_inquilino || null,
        telefone: dados.telefone_inquilino || null
      };
      body._novoInquilino = novoInquilinoData;
    }
  }
  if (Array.isArray(dados.lojas) && dados.lojas.length > 0 && picker?.setSelected) {
    const numeros = dados.lojas.map(x => Number(String(x).replace(/\D/g, ''))).filter(n => n > 0);
    picker.setSelected(numeros);
  }
  set('valor_aluguel', dados.valor_aluguel);
  set('dia_vencimento', dados.dia_vencimento);
  set('meses_carencia', dados.meses_carencia);
  set('prazo_meses', dados.prazo_meses);
  set('indice_reajuste', dados.indice_reajuste);
  set('tipo_garantia', dados.tipo_garantia);
  set('detalhes_garantia', dados.detalhes_garantia);
  set('parcial', dados.parcial);
  set('observacoes', dados.observacoes);
  if (dados.data_assinatura) set('data_assinatura', toIso(dados.data_assinatura));
  if (dados.data_inicio) set('data_inicio', toIso(dados.data_inicio));
  return novoInquilinoData;
}


// =====================================================================
// Helpers de Documentos
// =====================================================================
function urgenciaDoc(dataValidade) {
  if (!dataValidade) return { cor: '#94a3b8', label: '—' };
  const d = new Date(dataValidade);
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const dias = Math.floor((d - hoje) / 86400000);
  if (dias < 0)   return { cor: '#7f1d1d', label: 'Vencido há ' + Math.abs(dias) + 'd', bg: '#fef2f2' };
  if (dias <= 7)  return { cor: '#dc2626', label: 'Vence em ' + dias + 'd', bg: '#fef2f2' };
  if (dias <= 30) return { cor: '#ea580c', label: 'Vence em ' + dias + 'd', bg: '#fff7ed' };
  if (dias <= 60) return { cor: '#ca8a04', label: 'Vence em ' + dias + 'd', bg: '#fefce8' };
  return { cor: '#16a34a', label: 'OK (' + dias + 'd)', bg: '#f0fdf4' };
}

function renderDocsList(docs, container, abrirEditar) {
  container.innerHTML = '';
  if (!docs || docs.length === 0) {
    container.innerHTML = '<div style="padding:14px;background:#f8fafc;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--ink-soft);font-size:13px">Nenhum documento cadastrado ainda.</div>';
    return;
  }
  docs.forEach(d => {
    const u = urgenciaDoc(d.data_validade);
    const row = el('div');
    row.style.cssText = 'display:grid;grid-template-columns:1.4fr 1fr 130px 110px 60px;gap:10px;align-items:center;padding:8px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px';
    const validadeStr = d.data_validade ? new Date(d.data_validade).toLocaleDateString('pt-BR') : '—';
    row.innerHTML =
      '<div><div style="font-weight:600">' + (TIPOS_DOCUMENTO[d.tipo] || d.tipo) + '</div>' +
        '<div style="font-size:11px;color:var(--ink-soft)">' + (d.descricao || (d.numero ? 'Nº ' + d.numero : '—')) + '</div></div>' +
      '<div style="color:var(--ink-soft)">' + (d.numero ? 'Nº ' + d.numero : '') + '</div>' +
      '<div>Vence: <strong>' + validadeStr + '</strong></div>' +
      '<div><span style="background:' + u.bg + ';color:' + u.cor + ';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap">' + u.label + '</span></div>' +
      '<div style="display:flex;gap:4px;justify-content:flex-end">' +
        (d.arquivo_url ? '<button type="button" class="btn ghost sm" data-baixar-doc title="Baixar arquivo anexado">📎</button>' : '') +
        '<button type="button" class="btn outline sm" data-edit-doc>✏️</button>' +
        '<button type="button" class="btn ghost sm" data-del-doc style="color:#dc2626">🗑️</button>' +
      '</div>';
    const btnBaixar = row.querySelector('[data-baixar-doc]');
    if (btnBaixar) {
      btnBaixar.addEventListener('click', async () => {
        btnBaixar.disabled = true;
        try {
          const url = await getArquivoUrl(d.arquivo_url);
          if (url) window.open(url, '_blank');
          else mostrarToast('Arquivo nao encontrado no storage', 'error');
        } catch (err) {
          mostrarToast('Erro ao gerar URL: ' + err.message, 'error');
        } finally {
          btnBaixar.disabled = false;
        }
      });
    }
    row.querySelector('[data-edit-doc]').addEventListener('click', () => abrirEditar(d));
    row.querySelector('[data-del-doc]').addEventListener('click', async () => {
      if (!(await confirmarAcao({ titulo: 'Excluir documento', mensagem: 'Excluir o documento "' + (TIPOS_DOCUMENTO[d.tipo] || d.tipo) + '"?', confirmLabel: 'Excluir', perigo: true }))) return;
      try {
        await deleteDocumento(d.id);
        mostrarToast('Documento excluído', 'success');
        // Recarrega
        const docs2 = await getDocumentosByContrato(d.contrato_id);
        renderDocsList(docs2, container, abrirEditar);
      } catch (err) {
        mostrarToast('Erro ao excluir: ' + err.message, 'error');
      }
    });
    container.appendChild(row);
  });
}

function renderDocForm(contratoId, doc, onSalvarOuCancelar) {
  const box = el('div');
  box.style.cssText = 'padding:14px;background:#f8fafc;border:1px solid var(--line);border-radius:6px';
  const tit = el('div', { style: { fontWeight: '600', marginBottom: '10px' } }, doc ? 'Editar documento' : 'Novo documento');
  box.appendChild(tit);

  // ===== Painel de arquivo (sempre visível, em criação OU edição) =====
  // Em edição: mostra arquivo atual com botão Visualizar, e permite substituir
  if (doc && doc.arquivo_url) {
    const linkVer = el('div');
    linkVer.style.cssText = 'margin-bottom:10px;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px';
    linkVer.innerHTML = '<span>📎 <strong>Arquivo anexado.</strong> Substitua anexando um novo abaixo.</span>';
    const btnVer = el('button', { type:'button' }, '👁 Visualizar atual');
    btnVer.style.cssText = 'padding:4px 10px;border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap';
    btnVer.addEventListener('click', async () => {
      try {
        const url = await getArquivoUrl(doc.arquivo_url);
        if (url) window.open(url, '_blank');
      } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
      }
    });
    linkVer.appendChild(btnVer);
    box.appendChild(linkVer);
  }

  // SEMPRE mostra a caixa de upload (em criação ou edição)
  {
    const uploadBox = el('div');
    uploadBox.style.cssText = 'border:2px dashed #cbd5e1;border-radius:6px;padding:14px;text-align:center;background:#fff;margin-bottom:12px;cursor:pointer';
    const docInputId = 'doc_upload_' + Date.now();
    uploadBox.innerHTML =
      '<input type="file" id="' + docInputId + '" accept="application/pdf,image/jpeg,image/png" style="display:none">' +
      '<label for="' + docInputId + '" style="cursor:pointer;display:block">' +
      (doc
        ? '📎 <strong>Anexar/substituir arquivo</strong><br><span style="font-size:11px;color:var(--ink-soft)">PDF, JPG ou PNG. Sera salvo como arquivo deste documento.</span>'
        : '📎 <strong>Anexar PDF do documento</strong><br><span style="font-size:11px;color:var(--ink-soft)">Apolice, certidao, AVCB, alvara... O Claude le e preenche os campos, e o arquivo fica arquivado para download depois.</span>'
      ) +
      '</label>';
    box.appendChild(uploadBox);
    const iaStatus = el('div', { style: { display: 'none', marginBottom: '12px', padding: '10px', borderRadius: '6px', fontSize: '12px' } });
    box.appendChild(iaStatus);

    // Listener depois do appendChild
    setTimeout(() => {
      const inp = document.getElementById(docInputId);
      if (!inp) return;
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0];
        if (!f) return;
        box._fileParaUpload = f; // GUARDA referência pra usar no submit
        uploadBox.style.borderColor = 'var(--green)';
        uploadBox.querySelector('label').innerHTML = '✓ <strong>' + f.name + '</strong> · ' + (f.size/1024).toFixed(1) + ' KB';
        // Em modo edição NÃO chama auto-fill IA — só arquiva o arquivo
        if (doc) {
          iaStatus.style.display = 'block';
          iaStatus.style.background = '#ecfdf5';
          iaStatus.style.color = '#065f46';
          iaStatus.style.border = '1px solid #6ee7b7';
          iaStatus.innerHTML = '✓ Arquivo será anexado quando você salvar.';
          return;
        }
        iaStatus.style.display = 'block';
        iaStatus.style.background = '#eff6ff';
        iaStatus.style.color = '#1e40af';
        iaStatus.style.border = '1px solid #bfdbfe';
        iaStatus.innerHTML = '🤖 Claude está lendo o documento...';
        try {
          const ext = await extrairDocumentoDoPDF(f);
          const setVal = (name, value) => {
            if (value === null || value === undefined || value === '') return;
            const el2 = box.querySelector('[name=' + name + ']');
            if (el2) el2.value = value;
          };
          if (ext.tipo && TIPOS_DOCUMENTO[ext.tipo]) setVal('doc_tipo', ext.tipo);
          setVal('doc_numero', ext.numero);
          setVal('doc_descricao', ext.descricao);
          setVal('doc_emissao', ext.data_emissao);
          setVal('doc_validade', ext.data_validade);
          const c = ext.confianca ?? '?';
          iaStatus.style.background = '#ecfdf5';
          iaStatus.style.color = '#065f46';
          iaStatus.style.border = '1px solid #6ee7b7';
          iaStatus.innerHTML = '✓ Campos preenchidos pelo Claude (confiança ' + c + '/100). Revise antes de salvar.';
          mostrarToast('Documento lido com IA — revise os campos', 'success');
        } catch (err) {
          console.error('Erro extração documento:', err);
          iaStatus.style.background = '#fef2f2';
          iaStatus.style.color = '#991b1b';
          iaStatus.style.border = '1px solid #fecaca';
          iaStatus.innerHTML = '⚠️ Auto-preenchimento falhou: ' + err.message + '. Preencha manualmente.';
        }
      });
    }, 50);
  }

  const tipoOptions = Object.entries(TIPOS_DOCUMENTO).map(([v, l]) => ({ value: v, label: l }));
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'doc_tipo', label: 'Tipo', type: 'select', options: tipoOptions, value: doc?.tipo || 'seguro_fianca', required: true }));
  grid.appendChild(campo({ name: 'doc_numero', label: 'Número/apólice', value: doc?.numero || '' }));
  grid.appendChild(campo({ name: 'doc_descricao', label: 'Descrição (opcional)', value: doc?.descricao || '', full: true }));
  grid.appendChild(campo({ name: 'doc_emissao', label: 'Data de emissão', type: 'date', value: doc?.data_emissao || '' }));
  grid.appendChild(campo({ name: 'doc_validade', label: 'Data de validade', type: 'date', value: doc?.data_validade || '', required: true }));
  grid.appendChild(campo({ name: 'doc_obs', label: 'Observações', type: 'textarea', value: doc?.observacoes || '', full: true, rows: 2 }));
  box.appendChild(grid);

  const acoes = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' } });
  const btnSalvar = el('button', { type: 'button', className: 'btn sm' }, doc ? 'Salvar alterações' : 'Adicionar documento');
  const btnCancelar = el('button', { type: 'button', className: 'btn ghost sm' }, 'Cancelar');
  acoes.appendChild(btnCancelar);
  acoes.appendChild(btnSalvar);
  box.appendChild(acoes);

  btnCancelar.addEventListener('click', () => onSalvarOuCancelar());
  btnSalvar.addEventListener('click', async () => {
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
    try {
      const tipo = box.querySelector('[name=doc_tipo]').value;
      const numero = box.querySelector('[name=doc_numero]').value;
      const descricao = box.querySelector('[name=doc_descricao]').value;
      const emissao = box.querySelector('[name=doc_emissao]').value;
      const validade = box.querySelector('[name=doc_validade]').value;
      const obs = box.querySelector('[name=doc_obs]').value;
      if (!validade) throw new Error('Data de validade é obrigatória');
      const payload = {
        contrato_id: contratoId,
        tipo,
        numero: numero || null,
        descricao: descricao || null,
        data_emissao: emissao || null,
        data_validade: validade,
        observacoes: obs || null
      };
      if (doc?.id) payload.id = doc.id;
      // 1. Salva o documento (gera ID se for novo)
      const docSalvo = await saveDocumento(payload);
      // 2. Se tem arquivo anexado, faz upload e atualiza arquivo_url
      if (box._fileParaUpload && docSalvo?.id) {
        try {
          const arquivo = await uploadArquivo(box._fileParaUpload, {
            entidade_tipo: 'contrato',
            entidade_id: contratoId,
            categoria: 'outro'
          });
          if (arquivo?.storage_path) {
            await saveDocumento({ id: docSalvo.id, arquivo_url: arquivo.storage_path });
          }
        } catch (err) {
          console.error('Falha no upload do arquivo:', err);
          mostrarToast('Documento salvo mas upload falhou: ' + err.message, 'error');
        }
      }
      mostrarToast(doc ? 'Documento atualizado' : 'Documento adicionado', 'success');
      onSalvarOuCancelar();
    } catch (err) {
      mostrarToast('Erro ao salvar: ' + err.message, 'error');
      btnSalvar.disabled = false;
      btnSalvar.textContent = doc ? 'Salvar alterações' : 'Adicionar documento';
    }
  });

  return box;
}

// =====================================================================
// Painel de GESTÕES — itens gestionáveis identificados pela IA
// =====================================================================

// Mapeia tipo → ícone + cor de badge
const TIPO_GESTAO_INFO = {
  carencia_fim:           { icone: '⏳', cor: '#7c3aed', bg: '#f3e8ff', label: 'Carência' },
  reajuste_aniversario:   { icone: '📈', cor: '#0891b2', bg: '#cffafe', label: 'Reajuste' },
  marco_5anos:            { icone: '⚖️', cor: '#7c2d12', bg: '#fed7aa', label: 'Lei 8.245' },
  aviso_devolucao:        { icone: '📤', cor: '#c2410c', bg: '#ffedd5', label: 'Devolução' },
  termino:                { icone: '🏁', cor: '#dc2626', bg: '#fee2e2', label: 'Término' },
  garantia_pendencia:     { icone: '🛡️', cor: '#9a3412', bg: '#ffedd5', label: 'Garantia' },
  validacao_fianca:       { icone: '🔍', cor: '#0e7490', bg: '#cffafe', label: 'Fiança' },
  comprovantes:           { icone: '🧾', cor: '#15803d', bg: '#dcfce7', label: 'Encargos' },
  vistoria:               { icone: '🔧', cor: '#0f766e', bg: '#ccfbf1', label: 'Vistoria' },
  seguro:                 { icone: '🔥', cor: '#b91c1c', bg: '#fee2e2', label: 'Seguro' },
  destinacao:             { icone: '📋', cor: '#475569', bg: '#f1f5f9', label: 'Informativo' }
};

function calcularUrgencia(dataEvento) {
  if (!dataEvento) return { cor: '#475569', bg: '#f1f5f9', label: 'Sem data' };
  const d = new Date(dataEvento);
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const dias = Math.floor((d - hoje) / 86400000);
  if (dias < 0)    return { cor: '#7f1d1d', bg: '#fef2f2', label: 'Atrasado ' + Math.abs(dias) + 'd' };
  if (dias === 0)  return { cor: '#dc2626', bg: '#fef2f2', label: 'HOJE' };
  if (dias <= 30)  return { cor: '#dc2626', bg: '#fef2f2', label: 'Em ' + dias + 'd' };
  if (dias <= 90)  return { cor: '#ea580c', bg: '#fff7ed', label: 'Em ' + dias + 'd' };
  if (dias <= 180) return { cor: '#ca8a04', bg: '#fefce8', label: 'Em ' + dias + 'd' };
  return { cor: '#16a34a', bg: '#f0fdf4', label: 'Em ' + dias + 'd' };
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function rotuloRecorrencia(rec) {
  const m = {
    one_off: 'Único',
    anual: 'Anual',
    semestral: 'Semestral',
    mensal: 'Mensal',
    manual_recorrente: 'Check periódico',
    informativo: 'Regra informativa'
  };
  return m[rec] || rec;
}

function renderGestoesPainel(gestoes, container, btnAba, contratoId) {
  container.innerHTML = '';

  if (!gestoes || gestoes.length === 0) {
    container.innerHTML =
      '<div style="padding:30px;text-align:center;background:#f8fafc;border:1px dashed var(--line);border-radius:8px">' +
      '<div style="font-size:32px;margin-bottom:10px">🤖</div>' +
      '<div style="font-weight:600;color:var(--ink);margin-bottom:6px">Nenhuma gestão cadastrada ainda</div>' +
      '<div style="font-size:12px;color:var(--ink-soft)">Em breve: botão para analisar o contrato anexado com IA e gerar gestões automaticamente.</div>' +
      '</div>';
    return;
  }

  // Header com resumo
  const ativas = gestoes.filter(g => g.ativo);
  const proximas = ativas
    .filter(g => g.data_evento)
    .filter(g => new Date(g.data_evento) >= new Date(new Date().setHours(0,0,0,0)));
  const header = el('div', { className: 'gestoes-header' });
  header.innerHTML =
    '<div>📋 <strong>' + ativas.length + ' gestões ativas</strong>' +
    (proximas.length > 0 ? ' · próxima em ' + formatarData(proximas[0].data_evento) : '') +
    '</div>' +
    '<div style="font-size:11px;opacity:.7">Identificadas por IA a partir do contrato</div>';
  container.appendChild(header);


  // Lista de gestões
  const lista = el('div');
  gestoes.forEach(g => {
    const info = TIPO_GESTAO_INFO[g.tipo] || { icone: '📌', cor: '#475569', bg: '#f1f5f9', label: g.tipo };
    const urg = calcularUrgencia(g.data_evento);

    const card = el('div', { className: 'gestao-card' + (g.ativo ? '' : ' inativa') });
    card.innerHTML =
      '<div class="gicon">' + info.icone + '</div>' +
      '<div>' +
        '<div class="gtitulo">' + escapeHtml(g.titulo) +
          '<span class="gbadge" style="background:' + info.bg + ';color:' + info.cor + '">' + info.label + '</span>' +
        '</div>' +
        '<div class="gdesc">' + escapeHtml(g.descricao || '') + '</div>' +
        (g.clausula_origem ? '<div class="gclausula">📑 ' + escapeHtml(g.clausula_origem) + '</div>' : '') +
      '</div>' +
      '<div class="gdata">' +
        '<div class="gdata-data">' + formatarData(g.data_evento) + '</div>' +
        '<div class="gdata-rec">' + rotuloRecorrencia(g.recorrencia) + '</div>' +
        (g.data_evento ? '<div class="gbadge" style="background:' + urg.bg + ';color:' + urg.cor + '">' + urg.label + '</div>' : '') +
        '<label class="gtoggle">' +
          '<input type="checkbox" data-toggle-ativo ' + (g.ativo ? 'checked' : '') + '> ativa' +
        '</label>' +
      '</div>';

    card.querySelector('[data-toggle-ativo]').addEventListener('change', async (ev) => {
      const novoAtivo = ev.target.checked;
      try {
        await atualizarGestaoAtivo(g.id, novoAtivo);
        card.classList.toggle('inativa', !novoAtivo);
        g.ativo = novoAtivo;
        // Atualiza contador na aba
        const c = btnAba.querySelector('[data-gestoes-count]');
        if (c) c.textContent = String(gestoes.filter(x => x.ativo).length);
        mostrarToast(novoAtivo ? 'Gestão reativada' : 'Gestão desativada', 'success');
      } catch (err) {
        ev.target.checked = !novoAtivo;
        mostrarToast('Erro: ' + err.message, 'error');
      }
    });

    lista.appendChild(card);
  });
  container.appendChild(lista);

  // Rodapé com nota sobre o próximo passo
  const footer = el('div', {
    style: { marginTop: '14px', padding: '10px 14px', fontSize: '11px', color: 'var(--ink-soft)', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }
  });
  footer.innerHTML = '💡 Próximas fases: alertas automáticos no painel principal + sincronização com Google Agenda + análise IA para os outros contratos.';
  container.appendChild(footer);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
