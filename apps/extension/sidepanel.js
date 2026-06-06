const connection = document.getElementById("connection");
const approve = document.getElementById("approve");
const reject = document.getElementById("reject");

function setStatus(text) {
  if (connection) {
    connection.textContent = text;
  }
}

approve?.addEventListener("click", () => {
  setStatus("Draft approval queued locally");
});

reject?.addEventListener("click", () => {
  setStatus("Action rejected by seller");
});
