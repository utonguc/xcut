using XCut.Api.Models;

namespace XCut.Api.Services;

public interface ITokenService
{
    string CreateToken(User user);
    DateTime GetExpiryUtc();
}
