// =====================================================================
// state.js — estado global do app (filtros UI + flags de view)
// Substitui as variáveis avulsas em window.*. A camada UI lê/escreve via
// getState()/setState() e dispara um custom event para listeners reagirem
// quando preciso (ex: re-render parcial).
// =====================================================================

const _state = {
  propostasFiltro: 'ativas',      // 'ativas' | 'recusadas' | 'expiradas' | 'convertidas' | 'all'
  leadsFiltro: 'ativos',          // 'ativos' | 'interessado' | 'visitou' | ...
  mapaFullscreenAtivo: false,
};

/**
 * Lê um valor do estado. Sem chave, retorna o objeto inteiro (cópia rasa).
 */
export function getState(key) {
  if (key === undefined) return { ..._state };
  return _state[key];
}

/**
 * Atualiza um ou mais valores do estado.
 * Aceita setState('key', value) ou setState({ key1: v, key2: v }).
 * Emite 'state:change' no document com { detail: { changed: ['key1', ...] } }.
 */
export function setState(keyOrObj, value) {
  let changed = [];
  if (typeof keyOrObj === 'string') {
    if (_state[keyOrObj] !== value) {
      _state[keyOrObj] = value;
      changed = [keyOrObj];
    }
  } else if (keyOrObj && typeof keyOrObj === 'object') {
    for (const k of Object.keys(keyOrObj)) {
      if (_state[k] !== keyOrObj[k]) {
        _state[k] = keyOrObj[k];
        changed.push(k);
      }
    }
  }
  if (changed.length) {
    document.dispatchEvent(new CustomEvent('state:change', { detail: { changed } }));
  }
}

/**
 * Helpers tipados específicos (mais ergonômicos no consumer).
 */
export const StateKeys = Object.freeze({
  PROPOSTAS_FILTRO: 'propostasFiltro',
  LEADS_FILTRO: 'leadsFiltro',
  MAPA_FULLSCREEN: 'mapaFullscreenAtivo',
});

// === Compatibilidade temporária com código legado em index.html ===
// Mantém window._propostasFiltro / _leadsFiltro / _mapaFullscreenAtivo sincronizados
// com o state. Pode ser removido depois que o index.html migrar 100% pra import { setState }.
if (typeof window !== 'undefined') {
  const sync = () => {
    window._propostasFiltro = _state.propostasFiltro;
    window._leadsFiltro = _state.leadsFiltro;
    window._mapaFullscreenAtivo = _state.mapaFullscreenAtivo;
  };
  sync();
  document.addEventListener('state:change', sync);

  // Caminho inverso: detecta gravações legadas em window e copia pro state
  // (não usa Proxy pra não quebrar referências; pulling periódico não é necessário
  // já que as 3 escritas legadas são em handlers controlados de index.html)
}
