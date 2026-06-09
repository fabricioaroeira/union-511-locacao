// =====================================================================
// Chat IA — conversa com Claude sobre os dados do portfólio
// =====================================================================
import { chatComClaude } from './claude.js';
import {
  getInquilinos, getContratos, getLojasStatus, getPropostas, getKPIs
} from './data-layer.js';
import { fmtBR, formatMoney, LABELS_GARANTIA, LABELS_STATUS_PROPOSTA } from './utils.js';

let historico = [];
let contextoDb = '';
let ultimaAtualizacaoContexto = 0;
const TTL_CONTEXTO = 30 * 1000;

export async function initChat() {
  const panel = document.getElementById('chat-ia');
  if (!panel) return;
  if (panel.dataset.inicializado === '1') return;
  panel.dataset.inicializado = '1';

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>💬 Chat com Claude — pergunte sobre o portfólio</h2>
        <button class="btn outline" id="chat-limpar">Limpar conversa</button>
      </div>
      <div class="sub" style="margin-bottom:14px;color:var(--ink-soft)">
        O Claude tem acesso aos dados atuais do app (inquilinos, contratos, propostas, lojas).
        Pergunte sobre vencimentos, R$/m², ocupação, garantias, comparações, projeções.
      </div>

      <div id="chat-mensagens" style="
        min-height:280px;max-height:480px;overflow-y:auto;
        border:1px solid var(--border);border-radius:8px;
        padding:14px;background:var(--bg-soft);margin-bottom:12px">
      </div>

      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:6px">Sugestões rápidas:</div>
        <div id="chat-sugestoes" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>

      <form id="chat-form" style="display:flex;gap:8px">
        <textarea id="chat-input"
          placeholder="Pergunte algo sobre o portfólio... (Shift+Enter para nova linha)"
          rows="2"
          style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;resize:vertical"></textarea>
        <button type="submit" class="btn" id="chat-enviar" style="align-self:flex-end">Enviar</button>
      </form>
    </div>
  `;

  const mensagensEl = panel.querySelector('#chat-mensagens');
  const form = panel.querySelector('#chat-form');
  const input = panel.querySelector('#chat-input');
  const btnEnviar = panel.querySelector('#chat-enviar');
  const btnLimpar = panel.querySelector('#chat-limpar');
  const sugestoesEl = panel.querySelector('#chat-sugestoes');

  const sugestoes = [
    'Qual contrato vence primeiro?',
    'Qual o R$/m² médio do portfólio?',
    'Qual a receita potencial máxima ocupando 100%?',
    'Qual a área de cada loja ocupada?',
    'Quais contratos têm garantia mais fraca?',
    'Compare R$/m² entre os contratos'
  ];
  sugestoes.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn outline';
    chip.style.cssText = 'font-size:11px;padding:4px 10px';
    chip.textContent = s;
    chip.onclick = () => { input.value = s; input.focus(); };
    sugestoesEl.appendChild(chip);
  });

  if (historico.length === 0) {
    adicionarMensagem(mensagensEl, 'assistant',
      'Olá Fabricio! Sou o assistente de IA do Union 511. Tenho acesso aos dados do portfólio incluindo áreas de cada loja. Pergunte algo ou clique numa sugestão.');
  } else {
    historico.forEach(m => adicionarMensagem(mensagensEl, m.role, m.content));
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pergunta = input.value.trim();
    if (!pergunta) return;

    input.value = '';
    adicionarMensagem(mensagensEl, 'user', pergunta);
    historico.push({ role: 'user', content: pergunta });

    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Pensando...';
    const loadingEl = adicionarMensagem(mensagensEl, 'assistant', '🤔 ...', true);

    try {
      await atualizarContextoSeNecessario();
      const resposta = await chatComClaude(historico, contextoDb);
      loadingEl.remove();
      adicionarMensagem(mensagensEl, 'assistant', resposta);
      historico.push({ role: 'assistant', content: resposta });
    } catch (err) {
      loadingEl.remove();
      adicionarMensagem(mensagensEl, 'assistant', `⚠️ Erro: ${err.message}`);
      console.error(err);
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar';
    }
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  btnLimpar.addEventListener('click', () => {
    historico = [];
    mensagensEl.innerHTML = '';
    adicionarMensagem(mensagensEl, 'assistant',
      'Conversa reiniciada. Em que posso ajudar?');
  });
}

function adicionarMensagem(container, role, texto, temporaria = false) {
  const div = document.createElement('div');
  const ehUsuario = role === 'user';
  div.style.cssText = `
    margin-bottom:12px;padding:10px 14px;border-radius:8px;
    max-width:85%;font-size:13px;line-height:1.5;
    white-space:pre-wrap;word-wrap:break-word;
    ${ehUsuario
      ? 'background:#2563eb;color:white;margin-left:auto;text-align:left'
      : 'background:white;border:1px solid var(--border);color:var(--ink)'}
  `;
  if (temporaria) div.dataset.temp = '1';
  div.textContent = texto;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function atualizarContextoSeNecessario() {
  if (Date.now() - ultimaAtualizacaoContexto < TTL_CONTEXTO && contextoDb) return;
  contextoDb = await gerarContextoDb();
  ultimaAtualizacaoContexto = Date.now();
}

async function gerarContextoDb() {
  const [kpis, inquilinos, contratos, propostas, lojas] = await Promise.all([
    getKPIs().catch(() => null),
    getInquilinos().catch(() => []),
    getContratos('ativo').catch(() => []),
    getPropostas('ativas').catch(() => []),
    getLojasStatus().catch(() => [])
  ]);

  const areaByCodigo = {};
  lojas.forEach(l => { areaByCodigo[l.codigo] = l.area_privativa; });

  const somaArea = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);
  const areaTotalPredio = somaArea(lojas.map(l => l.area_privativa));
  const areaInternas    = somaArea(lojas.filter(l => l.status === 'uso_interno').map(l => l.area_privativa));
  const areaLocavel     = areaTotalPredio - areaInternas;
  const areaOcupada     = somaArea(lojas.filter(l => l.status === 'ocupada').map(l => l.area_privativa));
  const areaDisponivel  = somaArea(lojas.filter(l => !['uso_interno','ocupada'].includes(l.status)).map(l => l.area_privativa));
  const receitaMes      = somaArea(contratos.map(c => c.valor_aluguel));
  const rsmMedioPonderado = areaOcupada > 0 ? (receitaMes / areaOcupada) : null;

  const linhas = [];
  linhas.push('## KPIs gerais');
  if (kpis) {
    Object.entries(kpis).forEach(([k, v]) => linhas.push('- ' + k + ': ' + v));
  }

  linhas.push('');
  linhas.push('## Áreas (m² privativa) — fonte: planilha NBR 12.721 Q2 oficial Union 511');
  linhas.push('- Área total do prédio: ' + areaTotalPredio.toFixed(2) + ' m²');
  linhas.push('- Área locável (excluindo 4 lojas em uso interno): ' + areaLocavel.toFixed(2) + ' m²');
  linhas.push('- Área ocupada por contratos vigentes: ' + areaOcupada.toFixed(2) + ' m²');
  linhas.push('- Área disponível para locação: ' + areaDisponivel.toFixed(2) + ' m²');
  linhas.push('- Receita cheia/mês atual: ' + formatMoney(receitaMes));
  if (rsmMedioPonderado) {
    linhas.push('- R$/m² médio ponderado (atual): R$ ' + rsmMedioPonderado.toFixed(2) + '/m²');
    linhas.push('- Projeção: ocupando 100% da área locável ao mesmo R$/m² médio: ' + formatMoney(areaLocavel * rsmMedioPonderado) + '/mês');
  }

  linhas.push('');
  linhas.push('## Lojas (' + lojas.length + ' total) — código, área privativa, status, inquilino atual');
  lojas.forEach(l => {
    const area = l.area_privativa ? Number(l.area_privativa).toFixed(2) + ' m²' : '—';
    const inq = l.inquilino_atual ? ' · ' + l.inquilino_atual : '';
    linhas.push('- Loja ' + l.codigo + ' | ' + area + ' | ' + l.status + inq);
  });

  linhas.push('');
  linhas.push('## Inquilinos ativos (' + inquilinos.length + ')');
  inquilinos.slice(0, 30).forEach(i => {
    linhas.push('- ' + (i.nome_fantasia || i.razao_social) + ' (' + i.razao_social + ') — ' + (i.documento || 's/doc') + ' — ' + (i.segmento || 'sem segmento'));
  });

  linhas.push('');
  linhas.push('## Contratos ativos (' + contratos.length + ') — com m² e R$/m² calculado');
  contratos.slice(0, 30).forEach(c => {
    const lojasArr = Array.isArray(c.lojas) ? c.lojas : [];
    const lojasStr = lojasArr.join(',');
    const areas = lojasArr.map(cod => Number(areaByCodigo[cod] || 0));
    const areaTotal = areas.reduce((s, a) => s + a, 0);
    const rsm = areaTotal > 0 ? (Number(c.valor_aluguel) / areaTotal) : null;
    const detalheArea = lojasArr.length > 1
      ? lojasArr.map(cod => 'L' + cod + '=' + (areaByCodigo[cod] || '?') + 'm²').join(' + ') + ' = ' + areaTotal.toFixed(2) + ' m²'
      : areaTotal.toFixed(2) + ' m²';
    linhas.push(
      '- ' + (c.inquilino_nome || c.inquilino_razao_social || '?') +
      ' | lojas ' + lojasStr +
      ' | ' + detalheArea +
      ' | ' + formatMoney(c.valor_aluguel) + '/mês' +
      (rsm ? ' (R$ ' + rsm.toFixed(2) + '/m²)' : '') +
      ' | início ' + fmtBR(c.data_inicio) +
      ' | prazo ' + c.prazo_meses + 'm' +
      ' | término ' + fmtBR(c.data_termino) +
      ' | reajuste ' + (c.indice_reajuste || '?') +
      ' | garantia ' + (LABELS_GARANTIA[c.tipo_garantia] || c.tipo_garantia || '?')
    );
  });

  linhas.push('');
  linhas.push('## Propostas ativas (' + propostas.length + ') — com R$/m² calculado');
  propostas.slice(0, 20).forEach(p => {
    const lojasArr = Array.isArray(p.lojas) ? p.lojas : [];
    const lojasStr = lojasArr.join(',');
    const areaPropostaLojas = lojasArr.reduce((s, cod) => s + Number(areaByCodigo[cod] || 0), 0);
    const areaUsar = p.area_total || areaPropostaLojas;
    const rsm = areaUsar > 0 ? (Number(p.valor_aluguel) / Number(areaUsar)) : null;
    linhas.push(
      '- ' + (p.cliente_nome || '?') +
      ' | lojas ' + lojasStr +
      ' | ' + (areaUsar ? Number(areaUsar).toFixed(2) + ' m²' : 'sem área') +
      ' | ' + formatMoney(p.valor_aluguel) + '/mês' +
      (rsm ? ' (R$ ' + rsm.toFixed(2) + '/m²)' : '') +
      ' | status ' + (LABELS_STATUS_PROPOSTA[p.status] || p.status) +
      ' | proposta de ' + fmtBR(p.data_proposta)
    );
  });

  return linhas.join('\n');
}
