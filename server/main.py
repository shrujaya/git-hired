from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.example import router as example_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)


@app.get("/")
async def root():
    return {"hi": "there"}

# Register the router properly
app.include_router(example_router)
