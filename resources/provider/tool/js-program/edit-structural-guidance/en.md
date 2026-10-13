When Read is available, use {{fileMatches}} + text() + rewrite() for structural recomposition.

If you are about to calculate structural boundaries by hand, first ask whether {{fileMatches}} +
ordered anchors + text() already owns that boundary. If yes, use it. If a result later violates an
obvious invariant, treat that as a stop signal, not an invitation to keep guessing.
