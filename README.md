# Zombie Sky – Live interativa do TikTok

Jogo de aviões e helicópteros contra hordas de zumbis, feito para live.
O público entra digitando **!avião** ou **!heli** no chat. Presentes e curtidas mexem no jogo.

## Arquivos
- `index.html` – o jogo
- `server.js` – servidor que abre o jogo e lê a live do TikTok
- `package.json` – lista do que o servidor precisa
- `render.yaml` – configuração pronta para o Render

## Como abrir na live
`https://SEU-SITE.onrender.com/?live=LINK_DA_LIVE`

Cole depois de `?live=` o link da sua live (ex.: `https://www.tiktok.com/@seu_arroba/live` ou o link curto `vm.tiktok.com/...`). Também funciona só com o @: `?live=seu_arroba`. Ou abra o site e cole o link no painel **Live TikTok**.

O jogo conecta sozinho quando a live estiver aberta.

## Comandos do chat
| Comando | O que faz |
|---|---|
| `!avião` / `!heli` | entra na partida |
| `!trocar` | troca avião ↔ helicóptero |
| `!sair` | sai da partida |

## Presentes
| Presente | Efeito |
|---|---|
| Rosa | +1 nível para todos |
| 10–99 moedas | horda de 1.000 zumbis |
| 100+ moedas | chefe com o nome de quem mandou |
| 100 curtidas | conserta a aeronave de quem curtiu |

## Configuração (obrigatória)
O servidor usa o WebSocket do Euler Stream, que entra na live por você. Crie uma chave grátis em eulerstream.com (Dashboard → API Keys) e coloque no Render em
**Environment → EULER_API_KEY**.
