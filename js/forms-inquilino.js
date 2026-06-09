// =====================================================================
// Formulário de cadastrar/editar inquilino
// =====================================================================
import { getInquilino, saveInquilino } from './data-layer.js';
import { abrirModal, campo } from './modal.js';
import { el } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';

export async function abrirFormInquilino(id = null) {
  let dados = {};
  if (id) dados = await getInquilino(id) || {};

  const body = el('div');

  const sec1 = el('div', { className:'form-section' });
  sec1.appendChild(el('div', { className:'form-section-title' }, 'Identificação'));
  const grid1 = el('div', { className:'form-grid' });
  grid1.appendChild(campo({
    name:'tipo', label:'Pessoa', type:'select',
    options:[{value:'PJ',label:'Jurídica (PJ)'},{value:'PF',label:'Física (PF)'}],
    value:dados.tipo || 'PJ', required:true
  }));
  grid1.appendChild(campo({ name:'documento', label:'CNPJ / CPF', type:'text', value:dados.documento, required:true, placeholder:'00.000.000/0000-00 ou 000.000.000-00' }));
  grid1.appendChild(campo({ name:'razao_social', label:'Razão social / Nome completo', type:'text', value:dados.razao_social, required:true, full:true }));
  grid1.appendChild(campo({ name:'nome_fantasia', label:'Nome fantasia (opcional)', type:'text', value:dados.nome_fantasia, full:true }));
  grid1.appendChild(campo({ name:'segmento', label:'Segmento', type:'text', value:dados.segmento, placeholder:'Ex: Farmácia, Estética, Vestuário' }));
  grid1.appendChild(campo({ name:'email', label:'Email', type:'email', value:dados.email }));
  grid1.appendChild(campo({ name:'telefone', label:'Telefone', type:'text', value:dados.telefone }));
  grid1.appendChild(campo({ name:'endereco', label:'Endereço', type:'text', value:dados.endereco, full:true }));
  sec1.appendChild(grid1);
  body.appendChild(sec1);

  const sec2 = el('div', { className:'form-section' });
  sec2.appendChild(campo({ name:'observacoes', label:'Observações', type:'textarea', value:dados.observacoes, full:true, rows:3 }));
  body.appendChild(sec2);

  abrirModal({
    titulo: id ? 'Editar inquilino' : 'Novo inquilino',
    body,
    submitLabel: id ? 'Salvar alterações' : 'Cadastrar inquilino',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const input = {
        id,
        tipo: fd.get('tipo'),
        razao_social: fd.get('razao_social'),
        nome_fantasia: fd.get('nome_fantasia') || null,
        documento: fd.get('documento'),
        segmento: fd.get('segmento'),
        email: fd.get('email'),
        telefone: fd.get('telefone'),
        endereco: fd.get('endereco'),
        observacoes: fd.get('observacoes')
      };
      await saveInquilino(input);
      mostrarToast(id ? 'Inquilino atualizado' : 'Inquilino cadastrado');
      await renderTudo();
    }
  });
}
