from fastapi import APIRouter

router = APIRouter()

@router.get("/test")
async def testing():
    return {"test" : "succesful"}