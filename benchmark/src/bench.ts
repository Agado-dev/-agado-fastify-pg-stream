import autocannon from "autocannon";

autocannon(
	{
		url: "http://localhost:8081/realtime",

		connections: 100, //default 10
		workers: 10, //default 1
		pipelining: 1, // default
		duration: 30, // default 10

		method: "POST",
		body: JSON.stringify({ message: "hello" }),
		headers: {
			"Content-Type": "application/json",
		},
	},
	console.log,
);
