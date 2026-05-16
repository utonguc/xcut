namespace XCut.Api.Services;

public class InMemorySessionStore
{
    private readonly Dictionary<string, (string Token, DateTime ExpiresAt)> _store = new();

    public string CreateCode(string token)
    {
        var code = Guid.NewGuid().ToString("N")[..16];
        lock (_store)
        {
            var expired = _store.Where(kv => kv.Value.ExpiresAt <= DateTime.UtcNow)
                               .Select(kv => kv.Key).ToList();
            foreach (var k in expired) _store.Remove(k);
            _store[code] = (token, DateTime.UtcNow.AddMinutes(2));
        }
        return code;
    }

    public string? TakeToken(string code)
    {
        lock (_store)
        {
            if (_store.TryGetValue(code, out var v) && v.ExpiresAt > DateTime.UtcNow)
            {
                _store.Remove(code);
                return v.Token;
            }
            return null;
        }
    }
}
