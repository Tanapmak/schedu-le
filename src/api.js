import axios from "axios";

export default axios.create({
    baseURL: "https://schedu-le.onrender.com/api",
    headers: {"Content-Type": "application/json"}
});