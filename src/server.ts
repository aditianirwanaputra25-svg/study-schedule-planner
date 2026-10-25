import { env } from "./config/env.js";
import app from "./app.js";

app.listen(env.PORT, () => {
  console.log(`Study Schedule Planner berjalan pada port ${env.PORT}`);
});
