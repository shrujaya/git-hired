from fastapi import APIRouter

router = APIRouter(prefix="/api/example", tags=["Example"])

@router.get("/test")
async def testing():
    return {"test" : "succesful"}