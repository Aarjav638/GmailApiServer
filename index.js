import extractData from "./helpers/helper.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import colors from "colors";
import uploadRouter from "./Routes/Upload.js";

colors.enable();

const app = express();

app.use(cors());

app.use(express.json());

app.use(morgan("dev"));

app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;


app.get("/", (req, res) => {

  res.send("API is running...");
  
});


app.use("/api/v1/upload",uploadRouter );


app.get("/api/v1/emails", async (req, res) => {
    console.log("Request received");
    const response =await extractData().catch(console.error);
    res.status(200).send(response);

});


app.listen(PORT, () => {

  console.log(`Server is running on port ${PORT}`.yellow.bold);

});

