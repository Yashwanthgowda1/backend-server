const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
//const connectDB = require("./config/db");
//require("dotenv").config();
//const defaultVision = require('../controllers/defaultController');
const router = express.Router();

// def controller
const defaultVision = (req,res) => {
  res.send('Server is up and running');
};
// router.get('/', defaultVision);



//const defaultRoute = require("./routes/defaultRoutes");
//const userEmailRoutes = require("./routes/emailUsersRoutes");
//const emailVerifyRoute = require("./routes/emailVerifyRoutes");
//const jwtVerifyRouter = require("./routes/jwtVerifyRouter");
//const loginVerifyRoute = require("./routes/loginVerifyRouter");
//const socialUserRoute = require("./routes/socialUsersRoutes");


// Initialize the app
const app = express();

app.get("/", defaultVision); 

// Connect to MongoDB
//connectDB().catch(error => {
//  console.error("Error connecting to MongoDB:", error);
//});

// Middleware
//const corsOptions = {
 // origin: ['https://dchalios.vercel.app','http://localhost:5173'],
 // credentials: true,
 // methods: ["GET", "POST", "OPTIONS"],
 // optionsSuccessStatus: 200, 
//};

// Middleware
//app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//app.use(express.static(path.join(__dirname, "public")));

// Routes
//app.use("/api", defaultRoute);
//app.use("/api", userEmailRoutes);
//app.use("/api", emailVerifyRoute);
//app.use("/api", jwtVerifyRouter);
//app.use("/api", loginVerifyRoute);
//app.use("/api", socialUserRoute);

module.exports = app;

// Start the server (for local development)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
