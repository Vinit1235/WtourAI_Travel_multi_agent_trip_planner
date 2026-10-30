from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import uuid
from backend import run_trvel_agent

app = FastAPI(title="WTour Travel Planner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

class TravelRequest(BaseModel):
    query: str
    thread_id: Optional[str] = None

class TravelResponse(BaseModel):
    thread_id: str
    answer: str
    flight_results: str
    hostel_results: str
    iternary: str
    llm_calls: int

@app.get("/")
async def root():
    return FileResponse("templates/index.html")

@app.post("/api/travel", response_model=TravelResponse)
async def create_travel_plan(request: TravelRequest):
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    thread_id = request.thread_id or f"user_{uuid.uuid4().hex[:12]}"

    try:
        result = run_trvel_agent(request.query.strip(), thread_id)
        return TravelResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "WTour Travel Planner"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)