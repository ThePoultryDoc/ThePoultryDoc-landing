interface Env {
	TURNSTILE_SECRET_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return handleCORS();
		}

		// Only allow POST requests
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			// Get form data
			const formData = await request.formData();

			// Extract the Turnstile token
			const token = formData.get("cf-turnstile-response");

			// Validate the token
			if (!token || typeof token !== "string") {
				return new Response(
					JSON.stringify({ success: false, error: "Missing Turnstile token" }),
					corsHeaders(400)
				);
			}

			// Verify with Turnstile API
			const formDataTurnstile = new FormData();
			formDataTurnstile.append("secret", env.TURNSTILE_SECRET_KEY);
			formDataTurnstile.append("response", token);

			const turnstileResult = await fetch(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				{
					method: "POST",
					body: formDataTurnstile,
				}
			);

			const outcome = await turnstileResult.json<{
				success: boolean;
				"error-codes"?: string[];
			}>();

			// If Turnstile verification failed
			if (!outcome.success) {
				return new Response(
					JSON.stringify({
						success: false,
						error: "Turnstile verification failed",
						details: outcome["error-codes"]
					}),
					corsHeaders(400)
				);
			}

			// Forward the form data to Google script
			// Remove the Turnstile token before forwarding
			formData.delete("cf-turnstile-response");

			// Forward to Google script
			const googleScriptResponse = await fetch(
				"https://script.google.com/macros/s/AKfycbyScW0299vnJ53jEqqlZLYyo7u9_vZxbV4Dx4LgNk_Hun8bMfpt-w-Uh0F3y9i_f3qsMw/exec",
				{
					method: "POST",
					body: formData,
				}
			);

			// Return success response
			return new Response(
				JSON.stringify({ success: true }),
				corsHeaders(200)
			);
		} catch (error) {
			console.error("Error processing form:", error);
			return new Response(
				JSON.stringify({ success: false, error: "Internal server error" }),
				corsHeaders(500)
			);
		}
	},
};

// Helper functions for CORS
function handleCORS(): Response {
	return new Response(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Max-Age": "86400",
		},
		status: 204,
	});
}

function corsHeaders(status: number): ResponseInit {
	return {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": "application/json",
		},
		status,
	};
}
