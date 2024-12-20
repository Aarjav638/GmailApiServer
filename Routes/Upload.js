import { Router } from "express";
import multer from "multer";

const uploadRouter=Router();


uploadRouter.get("/",(req,res)=>{
    res.send("Upload Route");
});


const upload = multer({dest: 'uploads/'})



uploadRouter.post("/",upload.single('file'),(req,res)=>{
    let body = '';
req.on('data', (chunk) => {
    body += chunk.toString();
});

req.on('end', () => {
    console.log(body); // Process the body here
});
    res.send("File Uploaded");
});

export default uploadRouter;
