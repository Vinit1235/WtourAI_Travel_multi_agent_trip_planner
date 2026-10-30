import os
import certifi
import requests
from dotenv import load_dotenv
import certifi

load_dotenv()
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

from typing import TypedDict, Annotated
import operator
import psycopg
import uuid
from psycopg.rows import dict_row
from langgraph.graph import StateGraph,START, END
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.messages import (
    AnyMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_groq import ChatGroq
from tools.tavily_tool import tavily_search
from tools.flight_tool import search_flights


def _compact_text(value: str, limit: int = 450) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + " ...[truncated]"

def get_database_connection_url():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError(
            "Database url is missing, please add your url in the render postgresql ,and in the .env"
        )
    if "sslmode=" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"
    return database_url


GROK_API_KEY = os.getenv("GROQ_API_KEY")
if not GROK_API_KEY:
    raise ValueError(
        "GROQ_API_KEY is missing, please add your key in the .env"
    )
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
##LLM
llm = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROK_API_KEY
)

class TravelState(TypedDict):
    message:Annotated[list[AnyMessage],operator.add]
    user_query:str
    flight_results:str
    hostel_results:str
    iternerary:str
    llm_calls:int

#flight agent
def flight_agent(state: TravelState):
    query = state["user_query"]
    flight_data=search_flights(query)
    
    return{
        "flight_results": flight_data,
        "message": [
            AIMessage(content=f"Flight search fetched")
        ],
        "llm_calls": state.get("llm_calls",0) + 1
    }

#hotel agent
def hotel_agent(state: TravelState):
    query = f"Best hostels in {state['user_query']}"
    hostel_result = tavily_search(query)
    
    return{
        "hostel_results": hostel_result,
        "message": [
            AIMessage(content=f"Hostel search fetched")
        ],
        "llm_calls": state.get("llm_calls",0) + 1
    }
    
#Iternarty agent
def iternary_agent(state:TravelState):
    compact_flights = _compact_text(state.get("flight_results", ""), 220)
    compact_hostels = _compact_text(state.get("hostel_results", ""), 220)
    prompt=f"""
    Create a practical, budget-friendly itinerary in 6 short bullets.
    User query: {state['user_query']}
    Flight summary: {compact_flights}
    Hostel summary: {compact_hostels}
    Keep it concise and easy to follow.
    """

    response = llm.invoke([
        SystemMessage(content="You are a travel agent that creates iternaries based on user query and flight and hostel results"),
        HumanMessage(content=prompt)
    ])
    return{
        "iternary":response.content,
        "message":[response],
        "llm_calls": state.get("llm_calls",0) + 1
    }
#Final response agent
def final_agent(state:TravelState):
    compact_flights = _compact_text(state.get("flight_results", ""), 160)
    compact_hostels = _compact_text(state.get("hostel_results", ""), 160)
    compact_iternary = _compact_text(state.get("iternary", ""), 240)
    final_prompt=f"""
    Generate a concise final travel plan.
    User query: {state['user_query']}
    Flights: {compact_flights}
    Hostels: {compact_hostels}
    Itinerary: {compact_iternary}
    Keep output under 180 words.
    Format with sections:
    1) Trip Summary
    2) Flight Details
    3) Hostel Suggestions
    4) Day-to-Day Itinerary
    5) Budget Estimate
    6) Final Tips
    Mention flight pricing may be unavailable in live API and users should confirm prices on airline websites.
    """
    response = llm.invoke([
        SystemMessage(content="You are a travel agent booking assistant"),
        HumanMessage(content=final_prompt)
    ])
    return{
        "message":[response],
        "llm_calls": state.get("llm_calls",0) + 1
    }

#Build the Graph
graph = StateGraph(TravelState)
graph.add_node("flight_agent", flight_agent)
graph.add_node("hotel_agent", hotel_agent)
graph.add_node("iternary_agent", iternary_agent)
graph.add_node("final_agent", final_agent)

graph.add_edge(START, "flight_agent")
graph.add_edge("flight_agent", "hotel_agent")
graph.add_edge("hotel_agent", "iternary_agent")
graph.add_edge("iternary_agent", "final_agent")
graph.add_edge("final_agent", END)

#Postgres CheckPoints   
DATABASE_URL =get_database_connection_url()
_conn= psycopg.connect(
    DATABASE_URL,
    autocommit=True,
    row_factory=dict_row
)
checkpointer = PostgresSaver(_conn, )
checkpointer.setup()
travel_graph = graph.compile(checkpointer=checkpointer)

#function for fastapi
def run_trvel_agent(user_input:str , thread_id: str |None=None):
    if not thread_id:
        thread_id = f"user+{uuid.uuid4().hex}"
    config = {
        "configurable":{
            "thread_id":thread_id,
        }
    }
    result = travel_graph.invoke(
        {
            "message":[
                HumanMessage(content=user_input)
                
            ],
            "user_query":user_input,
            "flight_results":"",
            "hostel_results":"",
            "iternary":"",  
            "llm_calls":0
        
        },
        config=config
    )
    final_answer = result["message"][-1].content
    return {
        "thread_id":thread_id,
        "answer":final_answer,
        "flight_results":result.get("flight_results",""),
        "hostel_results":result.get("hostel_results",""),
        "iternary":result.get("iternary",""),
        "llm_calls":result.get("llm_calls",0)
    }