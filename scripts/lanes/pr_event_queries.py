"""Read-only issue and retirement queries used by PR event handling."""

def linear_issue(linear, identifier: str) -> dict | None:
    team, _, number = identifier.upper().partition("-")
    data = linear.gql('query($n:Float!,$t:String!){issues(filter:{team:{key:{eq:$t}},number:{eq:$n}})'
                      '{nodes{id state{name type} comments(last:20){nodes{body}}}}}', {"n": float(number), "t": team})
    nodes = data["issues"]["nodes"]
    return nodes[0] if nodes else None

RETIREMENT_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){number state headRefOid headRefName isCrossRepository isInMergeQueue
labels(first:100){pageInfo{hasNextPage} nodes{name}}}}}"""
