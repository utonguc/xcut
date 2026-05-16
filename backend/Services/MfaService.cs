using System.Collections.Concurrent;

namespace XCut.Api.Services;

public class MfaService
{
    record Entry(Guid UserId, string Code, DateTime Expiry, int Attempts);

    readonly ConcurrentDictionary<string, Entry> _store = new();

    public (string token, string code) Generate(Guid userId)
    {
        var token = Guid.NewGuid().ToString("N");
        var code  = Random.Shared.Next(100000, 999999).ToString();
        _store[token] = new Entry(userId, code, DateTime.UtcNow.AddMinutes(10), 0);
        if (_store.Count > 500)
            foreach (var k in _store.Where(p => p.Value.Expiry < DateTime.UtcNow).Select(p => p.Key).ToList())
                _store.TryRemove(k, out _);
        return (token, code);
    }

    public Guid? Verify(string token, string code)
    {
        if (!_store.TryGetValue(token, out var e)) return null;
        if (e.Expiry < DateTime.UtcNow) { _store.TryRemove(token, out _); return null; }
        if (e.Attempts >= 5)            { _store.TryRemove(token, out _); return null; }
        if (e.Code != code)
        {
            _store[token] = e with { Attempts = e.Attempts + 1 };
            return null;
        }
        _store.TryRemove(token, out _);
        return e.UserId;
    }
}
