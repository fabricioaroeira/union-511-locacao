// =====================================================================
// Formulário de criar/editar contrato
// =====================================================================
import { getContrato, saveContrato, getInquilinos, getLojasStatus, getProposta, saveInquilino,
         getDocumentosByContrato, saveDocumento, deleteDocumento, TIPOS_DOCUMENTO } from './data-layer.js';
import { abrirModal, campo, lojasPicker } from './modal.js';
import { el, fmtBR, parseBR } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';
import { extrairContratoDoPDF } from './claude.js';

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
  const picker = lojasPicker({ lojasStatus, selecionadas: dados.lojas || [], permitirOcupadas: !!id });
  sec2.appendChild(picker.el);
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
        '<button type="button" class="btn outline sm" data-edit-doc>✏️</button>' +
        '<button type="button" class="btn ghost sm" data-del-doc style="color:#dc2626">🗑️</button>' +
      '</div>';
    row.querySelector('[data-edit-doc]').addEventListener('click', () => abrirEditar(d));
    row.querySelector('[data-del-doc]').addEventListener('click', async () => {
      if (!confirm('Excluir o documento "' + (TIPOS_DOCUMENTO[d.tipo] || d.tipo) + '"?')) return;
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
      await saveDocumento(payload);
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
