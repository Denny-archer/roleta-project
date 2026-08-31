# Roleta de Eventos

Aplicação full stack para sorteio de brindes em eventos. O participante responde um Google Forms, acessa o link da roleta e informa o mesmo e-mail usado no formulário para concorrer.

## Como Funciona o Giro Único

A roleta não libera giro para qualquer e-mail digitado na tela. Antes do participante acessar a roleta, o e-mail precisa ter sido registrado no backend pelo Google Forms.

Fluxo esperado:

1. O participante responde o Google Forms.
2. Um Apps Script do Forms chama `POST /api/forms/submit`.
3. A API salva o participante na tabela `participants` com `has_spun = false`.
4. O participante abre a roleta pelo link do evento.
5. A tela pede o e-mail usado no Forms.
6. O frontend chama `POST /api/participant/validate`.
7. Se o e-mail existir para aquele evento e ainda não tiver girado, a roleta é liberada.
8. Depois do giro, a API marca `has_spun = true` e registra o prêmio no histórico.
9. Se a pessoa tentar girar de novo com o mesmo e-mail no mesmo evento, a API bloqueia e retorna o prêmio já registrado.

Por isso a mensagem `E-mail não encontrado para este evento. Responda o Forms antes de acessar a roleta.` significa que aquele e-mail ainda não foi cadastrado pelo endpoint do Forms para o evento atual.

## Link do Evento

O link final do Google Forms pode ser comum para todos:

```text
https://roleta.coffito.gov.br/?evento=nome-do-evento
```

Em teste local:

```text
http://localhost:5173/?evento=geral
```

O valor de `evento` precisa ser o mesmo enviado pelo Apps Script para a API.

## Teste Local

Suba o banco local:

```bash
docker compose up -d roleta_db
```

Suba a API:

```bash
cd server
npm start
```

Suba o frontend:

```bash
cd client
npm run dev
```

URLs úteis:

```text
API: http://localhost:3010
Swagger: http://localhost:3010/docs
Frontend: http://localhost:5173
```

## Cadastrar Participante Para Teste

Antes de validar um e-mail na roleta, cadastre o participante como se ele tivesse vindo do Google Forms.

No Swagger, abra:

```text
POST /api/forms/submit
```

Header:

```text
x-forms-secret: forms_teste
```

Body:

```json
{
  "evento": "geral",
  "email": "teste@empresa.com"
}
```

Depois acesse a roleta e informe:

```text
teste@empresa.com
```

## Endpoints Principais

- `GET /health`: verifica se a API está online.
- `GET /api/prizes?evento=geral`: lista os brindes do evento.
- `POST /api/prizes/save`: salva brindes do evento, exige `x-admin-password`.
- `DELETE /api/prizes/clear?evento=geral`: limpa dados do evento, exige `x-admin-password`.
- `POST /api/forms/submit`: registra participante elegível, exige `x-forms-secret`.
- `POST /api/participant/validate`: valida se o e-mail pode girar.
- `POST /api/spin`: sorteia o prêmio e bloqueia novo giro do mesmo e-mail.
- `GET /api/history?evento=geral`: lista os últimos sorteios.

## Variáveis Locais

Backend local em `server/.env`:

```env
DATABASE_URL=postgresql://roleta:roleta@localhost:5433/roleta_dev
PORT=3010
FRONTEND_URL=http://localhost:5174
ADMIN_PASSWORD=admin_teste
FORMS_WEBHOOK_SECRET=forms_teste
```

Frontend local em `client/.env`:

```env
VITE_API_URL=http://localhost:3010
```

Sempre reinicie o Vite depois de alterar `client/.env`.

## Apps Script do Google Forms

Exemplo mínimo para registrar o participante quando o Forms for enviado:

```javascript
const API_URL = 'https://roleta.coffito.gov.br/api/forms/submit';
const FORMS_SECRET = 'troque-este-segredo';
const EVENTO = 'nome-do-evento';

function onFormSubmit(e) {
  const email = e.response.getRespondentEmail();

  UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-forms-secret': FORMS_SECRET,
    },
    payload: JSON.stringify({
      evento: EVENTO,
      email,
    }),
  });
}
```

No ambiente de produção, configure `FORMS_WEBHOOK_SECRET` com o mesmo valor usado em `FORMS_SECRET`.
