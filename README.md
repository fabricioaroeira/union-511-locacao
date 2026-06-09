# Union 511 — App de Gestão de Locação

App de gestão do portfólio comercial do Edifício Union 511 Noroeste, construído como PWA (Progressive Web App) com Supabase como backend.

## Status atual

Em construção. Etapa 1: modelagem do banco e estrutura do projeto.

## Arquitetura

- **Front-end:** HTML/CSS/JS (sem framework pesado). Reaproveita 100% do dashboard atual e adiciona formulários CRUD.
- **Backend:** Supabase (PostgreSQL + Auth + Storage). Plano grátis até ~500MB banco, 1GB arquivos, 50k auth/mês.
- **Hospedagem:** Vercel (deploy via Git, HTTPS automático, CDN global).
- **Mobile:** PWA instalável no iPhone e Android via "Adicionar à tela inicial". Sem App Store.

## Estrutura de pastas

```
app/
├── README.md                 ← este arquivo
├── ARQUITETURA.md            ← decisões técnicas detalhadas
├── index.html                ← entrada (dashboard + CRUD)
├── login.html                ← tela de autenticação
├── manifest.json             ← config PWA (ícone, nome, cores)
├── service-worker.js         ← cache offline
├── icons/                    ← ícones do app em vários tamanhos
├── css/
│   ├── app.css               ← estilos do dashboard
│   └── forms.css             ← estilos dos modais de edição
├── js/
│   ├── supabase-client.js    ← cliente Supabase configurado
│   ├── data-layer.js         ← abstração de CRUD
│   ├── auth.js               ← login/logout/sessão
│   ├── render.js             ← lógica de render do dashboard
│   ├── forms-contrato.js     ← modal de criar/editar contrato
│   ├── forms-proposta.js     ← modal de criar/editar proposta
│   ├── forms-inquilino.js    ← modal de cadastrar inquilino
│   ├── upload.js             ← upload de PDFs para Supabase Storage
│   └── utils.js              ← helpers (datas, formatação)
└── sql/
    ├── 01-schema.sql         ← criação das tabelas
    ├── 02-seed-lojas.sql     ← insert das 52 lojas
    ├── 03-seed-vagas.sql     ← insert das 80 vagas
    ├── 04-views.sql          ← views para KPIs e listagens
    ├── 05-rls-policies.sql   ← políticas de acesso
    └── 06-seed-dados-atuais.sql ← inquilinos + contratos + propostas atuais
```

## Setup (instruções para o Fabrício)

### Pré-requisitos

1. **Conta Supabase** — https://supabase.com — login com Google, grátis
2. **Conta Vercel** — https://vercel.com — login com Google, grátis

### Passo a passo (a ser executado quando o código estiver pronto)

1. Criar projeto novo no Supabase chamado `union511`
2. Executar os 6 arquivos SQL na ordem dentro do "SQL Editor" do Supabase
3. Copiar URL do projeto e a `anon key` (em Settings → API)
4. Configurar variáveis no Vercel (URL e key do Supabase)
5. Deploy automático via Git

## Papéis de usuário

- **admin** — acesso total (você)
- **gestor** — pode editar tudo exceto excluir contratos
- **corretor** — pode criar/editar propostas, ler contratos, sem ver receita total
- **visualizador** — só lê
