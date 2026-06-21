// =====================================================================
// Chat IA — conversa com Claude sobre os dados do portfólio
// =====================================================================
import { chatComClaude } from './claude.js';
import { gerarContextoCompleto } from './chat-contexto.js';

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
        O Claude tem acesso COMPLETO ao portfólio: lojas (área, depósito, exaustão), inquilinos, contratos (com cláusulas-chave extraídas por IA), propostas, leads (timeline), financeiro (cobranças, inadimplência, despesas, DRE), documentos (seguros, AVCB, certidões), gestões e ocorrências, e alertas consolidados.
        Pergunte sobre vencimentos, R$/m², ocupação, garantias, cláusulas, gestões atrasadas, projeções, pipeline.
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
    'Quais alertas críticos preciso resolver hoje?',
    'Quais gestões de contrato estão atrasadas?',
    'Quais lojas têm exaustão e depósito?',
    'Compare cláusulas de renovação entre os contratos',
    'Qual a inadimplência atual e o total atualizado?',
    'Quais documentos vencem nos próximos 30 dias?',
    'Quantos leads ativos temos e algum parado?',
    'Qual a taxa de conversão de leads em propostas?',
    'Quais propostas estão acima do R$/m² médio?',
    'Qual contrato vence primeiro?',
    'Qual a receita potencial máxima ocupando 100%?',
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
      'Olá Fabricio! Sou o assistente de IA do Union 511. Tenho visão completa do portfólio: lojas (área, depósito, exaustão), contratos com cláusulas-chave, propostas, leads, financeiro (cobranças/inadimplência/despesas/DRE), documentos, gestões pendentes e alertas consolidados. Pergunte algo ou clique numa sugestão.');
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
  return await gerarContextoCompleto();
}
