# WTour — Multi-Agent AI Travel Planner

WTour turns a free-form trip request into a complete travel dossier: flight options, hostel suggestions, a day-by-day itinerary, a budget estimate, and final tips. Specialist agents handle each part of the research, and a PostgreSQL-backed LangGraph checkpointer keeps the conversation state per traveler.

## What it does

Enter a request such as:

> 7 days in Japan from Mumbai under $2,000

The backend runs a four-agent LangGraph pipeline:

```
START → flight_agent → hotel_agent → itinerary_agent → final_agent → END
```

| Agent | Job | Data source |
| --- | --- | --- |
| `flight_agent` | Resolves airports/countries and looks up flight options | AviationStack |
| `hotel_agent` | Searches for hostels and stays | Tavily |
| `iternary_agent` | Builds a concise itinerary from the query and research | Groq LLM |
| `final_agent` | Formats the final six-section travel plan | Groq LLM |

The final answer is formatted with these sections, which the frontend renders as separate cards:

1. Trip Summary
2. Flight Details
3. Hostel Suggestions
4. Day-to-Day Itinerary
5. Budget Estimate
6. Final Tips

## Tech stack

- **API:** FastAPI + Uvicorn
- **Agents:** LangGraph, LangChain, Groq
- **Research:** Tavily, AviationStack, `airportsdata`, `pycountry`
- **Persistence:** PostgreSQL via `langgraph-checkpoint-postgres`
- **Frontend:** plain HTML, CSS, and JavaScript served by FastAPI — no npm, React, or build step

## Project structure

```
WTour_Multi_Agent/
├── app.py                  # FastAPI app, routes, static/template serving
├── backend.py              # LangGraph agents, state, PostgreSQL checkpointer
├── tools/
│   ├── flight_tool.py      # AviationStack flight lookup and airport resolution
│   └── tavily_tool.py      # Tavily hostel/web search
├── templates/
│   └── index.html          # Single-page frontend
├── static/
│   ├── images/             # Unsplash photography for postcards and the atlas background
│   ├── style.css           # Design tokens, layout, responsive/dark/reduced-motion styles
│   └── script.js           # Form flow, response parsing, rendering, copy/restart
├── requirements.txt
└── .env                    # Local secrets (not committed)
```

## Setup

Prerequisites: Python 3.10+ and a PostgreSQL database.

### 1. Create a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b

AVIATIONSTACK_API_KEY=your_aviationstack_key
DEFAULT_ORIGIN_IATA=DAC

TAVILY_API_KEY=your_tavily_key

DATABASE_URL=postgresql://user:password@host:5432/dbname
```

| Variable | Required | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes | Used by the LangGraph agents. |
| `GROQ_MODEL` | No | Defaults to `openai/gpt-oss-120b`. |
| `AVIATIONSTACK_API_KEY` | Yes | Required for live flight lookups. |
| `DEFAULT_ORIGIN_IATA` | No | Fallback origin airport. Defaults to `DAC` (Dhaka). |
| `TAVILY_API_KEY` | Yes | Used for hostel/web research. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. `sslmode=require` is added automatically when missing. |
| `LANGSMITH_*` | No | Optional LangSmith tracing configuration. |

> The PostgreSQL connection is created when `backend.py` is imported, so the app will not start without a reachable `DATABASE_URL`.

### 4. Run the app

```bash
python app.py
```

or:

```bash
uvicorn app:app --reload --port 8000
```

Open http://localhost:8000.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Serves the frontend. |
| `POST` | `/api/travel` | Runs the agent graph. Body: `{ "query": "...", "thread_id": "optional" }`. |
| `GET` | `/api/health` | Health check. |

`POST /api/travel` returns:

```json
{
  "thread_id": "user_abc123",
  "answer": "1) Trip Summary ...",
  "flight_results": "...",
  "hostel_results": "...",
  "iternary": "...",
  "llm_calls": 4
}
```

Pass the returned `thread_id` back in a later request to continue the same conversation.

## Frontend

The UI uses a travel-desk aesthetic: ink borders, hard offset shadows, dashed ticket tear-lines, an atlas-style route loader, and a dossier grid.

- **Typography:** Bricolage Grotesque for display, Instrument Sans for body.
- **Palette:** pale paper, deep ink, cobalt, marigold, and sea green.
- **Imagery:** a low-opacity vintage atlas behind the page and three tilted destination postcards above the fold.
- **Layout:** ticketing-style search panel, a three-stop "how the desk works" route, and uneven result cards (wider itinerary, inverted budget panel, full-width tips).
- **Motion:** a short hero entrance, postcard hover/focus zoom, and scroll-driven reveals where `animation-timeline` is supported.
- **Behavior:** postcards fill the query, the loading state animates through the agent steps, empty sections are hidden, and results can be copied or cleared with "Start over".
- **Accessibility:** visible keyboard focus, skip link, semantic landmarks, `aria-live` status/error regions, responsive down to mobile, automatic dark mode, and reduced-motion support.

Photography from [Unsplash](https://unsplash.com). Frontend files are edited directly; restarting Uvicorn is enough to see HTML/CSS/JS changes (a hard refresh may be needed to bypass browser cache).

## Notes

- AviationStack's free tier can limit live flight data and pricing. The final plan explicitly reminds travelers to confirm fares on airline websites.
- The itinerary and summary are model-generated; verify visas, schedules, and prices before booking.
- If a section is missing from the model response, the corresponding card is hidden rather than showing an empty placeholder.

## License

MIT — see [LICENSE](LICENSE).
