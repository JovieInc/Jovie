import Foundation
import Testing
@testable import Jovie

struct ObservabilityRedactionTests {
  @Test func filtersSensitiveKeysAndStringValues() {
    let sanitized = ObservabilityRedactor.sanitizedContext([
      "access_token": "access_secret_123",
      "authorization": "Bearer abcdefghijklmnopqrstuvwxyz123456",
      "cookie": "sid=session_secret; Path=/",
      "email": "tim@example.com",
      "lowercase_email_message": "Contact user@example.com for help",
      "message": "Email tim@example.com or call +1 415 555 1212",
      "opaque_session": "this_is_a_long_debug_identifier_without_digits",
      "phone_number": "+1 415 555 1212",
      "refreshToken": "refresh_secret_123",
      "safe": "profile_loaded",
      "safe_message": "Captured non-sensitive value abcdefghijklmnopqrstuvwxyzabcdef",
      "user_id": "user_1234567890",
    ])

    #expect(sanitized["access_token"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["authorization"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["cookie"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["email"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["lowercase_email_message"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["message"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["opaque_session"] as? String == "this_is_a_long_debug_identifier_without_digits")
    #expect(sanitized["phone_number"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["refreshToken"] as? String == ObservabilityRedactor.filteredValue)
    #expect(sanitized["safe"] as? String == "profile_loaded")
    #expect(sanitized["safe_message"] as? String == "Captured non-sensitive value abcdefghijklmnopqrstuvwxyzabcdef")
    #expect(sanitized["user_id"] as? String == ObservabilityRedactor.filteredValue)
  }

  @Test func urlSanitizationKeepsOnlyRouteAndQueryKeyNames() throws {
    let sanitized = try #require(
      ObservabilityRedactor.sanitizedValue(
        URL(
          string: "https://jov.ie/auth/start?code=code_secret&state=state_secret&return_to=/app"
        )!
      ) as? ObservabilityContext
    )

    #expect(sanitized["scheme"] as? String == "https")
    #expect(sanitized["host"] as? String == "jov.ie")
    #expect(sanitized["path"] as? String == "/auth/start")
    #expect(sanitized["queryKeys"] as? [String] == ["code", "return_to", "state"])

    let payload = String(describing: sanitized)
    #expect(!payload.contains("code_secret"))
    #expect(!payload.contains("state_secret"))
    #expect(!payload.contains("/app"))
  }

  @Test func urlPathWithSensitiveValueIsFiltered() throws {
    let sanitized = try #require(
      ObservabilityRedactor.sanitizedValue(
        URL(
          string: "https://jov.ie/user/user@example.com/callback?code=code_secret&state=state_secret"
        )!
      ) as? ObservabilityContext
    )

    #expect(sanitized["scheme"] as? String == "https")
    #expect(sanitized["host"] as? String == "jov.ie")
    #expect(sanitized["path"] as? String == "/user/[Filtered]/callback")
    #expect(sanitized["queryKeys"] as? [String] == ["code", "state"])

    let requestURL = ObservabilityRedactor.sanitizedURLString(
      "https://jov.ie/user/user@example.com/callback?code=code_secret&state=state_secret"
    )

    #expect(requestURL == "https://jov.ie/user/[Filtered]/callback?query_keys=code,state")
    #expect(!requestURL.contains("user@example.com"))
    #expect(!requestURL.contains("code_secret"))
    #expect(!requestURL.contains("state_secret"))
  }

  @Test func urlPathIdentifiersAreFilteredBySegment() throws {
    let sanitized = try #require(
      ObservabilityRedactor.sanitizedValue(
        URL(
          string: "https://jov.ie/users/12345/sessions/550e8400-e29b-41d4-a716-446655440000?state=state_secret"
        )!
      ) as? ObservabilityContext
    )

    #expect(sanitized["scheme"] as? String == "https")
    #expect(sanitized["host"] as? String == "jov.ie")
    #expect(sanitized["path"] as? String == "/users/[Filtered]/sessions/[Filtered]")
    #expect(sanitized["queryKeys"] as? [String] == ["state"])

    let payload = String(describing: sanitized)
    #expect(!payload.contains("12345"))
    #expect(!payload.contains("550e8400-e29b-41d4-a716-446655440000"))
    #expect(!payload.contains("state_secret"))
  }

  @Test func callbackURLPayloadDoesNotContainSensitiveValues() throws {
    let sanitized = ObservabilityRedactor.sanitizedContext([
      "callback_url": "ie.jov.jovie://auth/complete?code=code_secret&state=state_secret&access_token=access_secret&id_token=id_secret&email=tim@example.com&phone=%2B14155551212",
    ])

    let callback = try #require(
      sanitized["callback_url"] as? ObservabilityContext
    )
    #expect(callback["scheme"] as? String == "ie.jov.jovie")
    #expect(callback["host"] as? String == "auth")
    #expect(callback["path"] as? String == "/complete")
    #expect(
      callback["queryKeys"] as? [String] == [
        "access_token",
        "code",
        "email",
        "id_token",
        "phone",
        "state",
      ]
    )

    let payload = String(describing: sanitized)
    #expect(!payload.contains("code_secret"))
    #expect(!payload.contains("state_secret"))
    #expect(!payload.contains("access_secret"))
    #expect(!payload.contains("id_secret"))
    #expect(!payload.contains("tim@example.com"))
    #expect(!payload.contains("+14155551212"))
  }
}
