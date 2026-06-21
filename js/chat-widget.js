// =====================================================================
// Chat Widget Flutuante — canto inferior direito
// Usa o módulo compartilhado chat-contexto.js (mesma capacidade que a aba Chat IA)
// =====================================================================
import { chatComClaude } from './claude.js';
import { gerarContextoCompleto } from './chat-contexto.js';

// Estado do widget (independente da aba Chat IA)
let historico = [];
let contextoDb = '';
let ultimaAtualizacao = 0;
const TTL = 30 * 1000;

export function initChatWidget() {
  const widget = document.getElementById('chat-widget');
  const trigger = document.getElementById('chat-widget-trigger');
  const painel = document.getElementById('chat-widget-painel');
  const btnClose = document.getElementById('chat-widget-close');
  const mensagensEl = document.getElementById('chat-widget-mensagens');
  const sugestoesEl = document.getElementById('chat-widget-sugestoes');
  const form = document.getElementById('chat-widget-form');
  const input = document.getElementById('chat-widget-input');
  const btnEnviar = document.getElementById('chat-widget-enviar');

  if (!widget || !trigger || !painel) return;

  // Abrir/fechar só por clique
  const abrir = () => {
    if (widget.classList.contains('aberto')) return;
    widget.classList.add('aberto');
    if (mensagensEl.children.length === 0) {
      addMsg(mensagensEl, 'bot',
        'Olá! Sou o assistente IA do Union 511. Tenho visão completa do portfólio: lojas (área, depósito, exaustão), contratos com cláusulas-chave, propostas, leads, financeiro, documentos, gestões pendentes e alertas. Pergunte algo ou clique numa sugestão.');
    }
    setTimeout(() => input?.focus(), 250);
  };
  const fechar = () => widget.classList.remove('aberto');

  trigger.addEventListener('click', () => {
    if (widget.classList.contains('aberto')) fechar(); else abrir();
  });
  btnClose.addEventListener('click', (e) => { e.stopPropagation(); fechar(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && widget.classList.contains('aberto')) fechar();
  });

  // Sugestões rápidas — alinhadas com novas capacidades
  const sugestoes = [
    'Alertas críticos agora?',
    'Gestões atrasadas?',
    'Lojas com exaustão?',
    'Inadimplência atual?',
    'Documentos vencendo em 30 dias?',
    'Algum lead parado?',
    'Resumo do mês',
    'Qual contrato vence primeiro?',
    'R$/m² médio do portfólio?'
  ];
  sugestoes.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chat-widget-chip';
    chip.textContent = s;
    chip.onclick = () => { input.value = s; input.focus(); };
    sugestoesEl.appendChild(chip);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pergunta = input.value.trim();
    if (!pergunta) return;

    input.value = '';
    addMsg(mensagensEl, 'user', pergunta);
    historico.push({ role: 'user', content: pergunta });

    btnEnviar.disabled = true;
    const loadingEl = addMsg(mensagensEl, 'bot', '🤔 ...');

    try {
      if (Date.now() - ultimaAtualizacao > TTL || !contextoDb) {
        contextoDb = await gerarContextoCompleto();
        ultimaAtualizacao = Date.now();
      }
      const resposta = await chatComClaude(historico, contextoDb);
      loadingEl.remove();
      addMsg(mensagensEl, 'bot', resposta);
      historico.push({ role: 'assistant', content: resposta });
    } catch (err) {
      loadingEl.remove();
      addMsg(mensagensEl, 'bot', '⚠️ Erro: ' + (err.message || err));
      console.error('Chat widget erro:', err);
    } finally {
      btnEnviar.disabled = false;
    }
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

function addMsg(container, tipo, texto) {
  const div = document.createElement('div');
  div.className = 'chat-widget-msg ' + tipo;
  div.textContent = texto;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}
