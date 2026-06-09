// =====================================================================
// Formulário de criar/editar proposta
// =====================================================================
import { getProposta, saveProposta, getLojasStatus } from './data-layer.js';
import { abrirModal, campo, lojasPicker } from './modal.js';
import { el } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';
import { extrairPropostaDoPDF } from './claude.js';

export async function abrirFormProposta(id = null) {
  let dados = {};
  if (id) dados = await getProposta(id);

  const lojasStatus = await getLojasStatus();
  const body = el('div');

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
  const picker = lojasPicker({ lojasStatus, selecionadas: dados.lojas || [], permitirOcupadas: false });
  sec2.appendChild(picker.el);
  body.appendChild(sec2);

  // Termos comerciais
  const sec3 = el('div', { className:'form-section' });
  sec3.appendChild(el('div', { className:'form-section-title' }, 'Termos comerciais'));
  const grid3 = el('div', { className:'form-grid cols-3' });
  grid3.appendChild(campo({ name:'area_total', label:'Área total (m²)', type:'number', value:dados.area_total, hint:'Necessária para calcular R$/m²' }));
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

  // Observações
  const sec4 = el('div', { className:'form-section' });
  sec4.appendChild(campo({ name:'observacoes', label:'Observações', type:'textarea', value:dados.observacoes, full:true, rows:3 }));
  body.appendChild(sec4);

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
      await saveProposta(input);
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
  set('area_total', dados.area_total);
  set('valor_aluguel', dados.valor_aluguel);
  set('meses_carencia', dados.meses_carencia);
  set('prazo_opcoes', dados.prazo_opcoes);
  set('tipo_garantia', dados.tipo_garantia);
  set('detalhes_garantia', dados.detalhes_garantia);
  set('observacoes', dados.observacoes);

  if (Array.isArray(dados.lojas) && dados.lojas.length > 0 && picker?.setSelected) {
    const numeros = dados.lojas.map(x => Number(String(x).replace(/\D/g, ''))).filter(n => n > 0);
    picker.setSelected(numeros);
  }
}
