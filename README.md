# tradesConverter

Script Node.js que descarga el historial de operaciones de **Pacifica** y **Jupiter Perps** para una wallet, filtra los trades realizados desde el **1 de mayo** y los exporta a `trades.csv`.

## Requisitos

- Node.js 18+ (usa `fetch` nativo).

## Uso

```bash
node fetchTrades.js
```

Se generan tres ficheros:

- `pacifica.json` — respuesta cruda del endpoint Pacifica.
- `jupiter.json` — respuesta cruda del endpoint Jupiter.
- `trades.csv` — CSV final con las columnas pedidas.

## Columnas del CSV

| Columna | Descripción |
| --- | --- |
| Date | Fecha de apertura (YYYY-MM-DD, UTC) |
| Resultado (PNL USD) | PnL realizado |
| Ganada (1/0) | 1 si PnL > 0 |
| Día de la semana | En español, según apertura |
| Mes | En español |
| Side | `long` / `short` |
| Apertura | `YYYY-MM-DD HH:MM:SS` UTC |
| Cierre | `YYYY-MM-DD HH:MM:SS` UTC |
| Tipo de cierre | `TP`, `SL`, `Manual` (con `?` si se infiere por el signo del PnL) |
| Duración | `HH:MM:SS` |
| Tamaño posición (USD) | Notional de la posición |
| Symbol | Par operado |
| Fuente | `Pacifica` / `Jupiter` |

## Notas

Como los esquemas reales de ambas APIs pueden variar ligeramente, el parser es **defensivo** y prueba varios nombres de campos comunes (`pnl`, `realized_pnl`, `realizedPnlUsd`, etc.). Si tras la primera ejecución alguna columna queda vacía, abre los ficheros `pacifica.json` / `jupiter.json` para comprobar los nombres reales y ajusta las funciones `normalizePacifica` / `normalizeJupiter` en `fetchTrades.js`.

Los ajustes de TP/SL (acciones de tipo `triggerOrder`, `updateOrder`, etc.) se descartan automáticamente; sólo se exportan los trades con PnL realizado.
