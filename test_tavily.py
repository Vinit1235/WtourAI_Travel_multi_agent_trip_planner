from tools.tavily_tool import tavily_search
from backend import run_trvel_agent
# res = tavily_search("trending ai models")
# print(res)
response = run_trvel_agent("Best hostels in Paris 7 days", thread_id="12345")
print(response["answer"])