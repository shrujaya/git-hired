from fastapi import FastAPI
from routes.example import router as example_router

app = FastAPI()

@app.get("/")
async def root():
    return {"hi": "there"}

# Register the router properly
app.include_router(example_router)
