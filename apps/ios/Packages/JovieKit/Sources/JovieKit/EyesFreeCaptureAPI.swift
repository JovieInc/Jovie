public struct EyesFreeCaptureAPIRequest: Encodable, Sendable {
  public let destination: String
  public let transcript: String
  public let clientTurnId: String
  public let clientMessageId: String

  public init(destination: String, transcript: String, clientTurnId: String, clientMessageId: String) {
    self.destination = destination
    self.transcript = transcript
    self.clientTurnId = clientTurnId
    self.clientMessageId = clientMessageId
  }
}

public struct EyesFreeCaptureAPIResponse: Decodable, Equatable, Sendable {
  public let destination: String
  public let status: String
  public let conversationId: String?
  public let turnId: String?
  public let readback: String
  public let errorCode: String?

  public init(
    destination: String,
    status: String,
    conversationId: String?,
    turnId: String?,
    readback: String,
    errorCode: String?
  ) {
    self.destination = destination
    self.status = status
    self.conversationId = conversationId
    self.turnId = turnId
    self.readback = readback
    self.errorCode = errorCode
  }
}
